import express from "express";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import { prisma } from "./lib/prisma";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(compression());
app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
}));

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            "http://localhost:5173",
            "https://assuffa-result-frntend.vercel.app",
            "https://assuffa-result-frntend-rvkq.vercel.app"
        ];

        if (allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

app.use(express.json());
app.use(cookieParser());

// Trust Vercel's proxy so rate limiting works per user IP, not Vercel's IP
app.set("trust proxy", 1);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500, // Increased to 500 for high burst traffic during results day
    message: { message: "Too many requests from this IP, please try again later." }
});
app.use(limiter);

// Mount routes
app.use(["/api/auth", "/auth"], authRoutes);
app.use(["/api/admin", "/admin"], adminRoutes);

app.get(["/", "/api", "/health"], (_req, res) => {
    res.status(200).json({
        name: "As-Swuffah Results Management API",
        version: "1.0.0",
        status: "operational",
        environment: process.env.NODE_ENV || "production",
        hasDB: !!process.env.DATABASE_URL,
        hasJWT: !!process.env.JWT_SECRET,
        hasDirect: !!process.env.DIRECT_URL,
    });
});

// Diagnostic endpoint — shows env var presence and DB connectivity
app.get("/api/debug", async (_req, res) => {
    const checks: Record<string, any> = {
        DATABASE_URL: !!process.env.DATABASE_URL,
        DIRECT_URL: !!process.env.DIRECT_URL,
        JWT_SECRET: !!process.env.JWT_SECRET,
        NODE_ENV: process.env.NODE_ENV,
    };
    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.db_connected = true;
    } catch (e: any) {
        checks.db_connected = false;
        checks.db_error = e.message;
    }
    res.json(checks);
});

// 404 fallback
app.use((_req, res) => {
    res.status(404).json({ message: "API route not found" });
});

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status || 500;
    console.error(`[ERROR] `, err);
    res.status(status).json({
        message: err.message || "Internal Server Error",
    });
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

export default app;
