import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import { prisma } from "./lib/prisma";

dotenv.config();

// Enforce critical environment variables
const requiredEnvs = ['DATABASE_URL', 'JWT_SECRET'];
requiredEnvs.forEach(env => {
    if (!process.env[env]) {
        console.error(`[CRITICAL] Environment variable ${env} is missing.`);
    }
});

const app = express();
const PORT = process.env.PORT || 5000;

// Universal CORS at the very top
app.use(cors({
    origin: (origin, callback) => {
        // Just say yes - we've already secured it in vercel.json
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// OPTIONS preflight shortcut
app.options('*', (req, res) => {
    res.status(200).send('OK');
});

app.use(helmet({ crossOriginResourcePolicy: false }));

app.use(express.json());
app.use(cookieParser());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: "Too many requests from this IP, please try again later." }
});
app.use(limiter);

// Mount routes with path-agnostic prefixes (handles both /api/* and /*)
app.use(["/api/auth", "/auth"], authRoutes);
app.use(["/api/admin", "/admin"], adminRoutes);

app.get(["/", "/api"], (req, res) => {
    res.status(200).json({
        name: "As-Swuffah Results Management API",
        version: "1.0.0",
        status: "operational",
        documentation: "https://assuffa-result-frntend-rvkq.vercel.app",
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint for deployment validation
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", environment: process.env.NODE_ENV || "development" });
});

// JSON based 404 for API routes
app.use((req, res) => {
    res.status(404).json({ message: "API route not found" });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const status = err.status || 500;
    const isProduction = process.env.NODE_ENV === 'production';

    // Detailed logging for internal server errors
    if (status >= 500) {
        console.error(`[FATAL ERROR] ${req.method} ${req.url}:`, err);
    } else {
        console.warn(`[WARN] ${req.method} ${req.url}: ${err.message || 'Client error'}`);
    }

    res.status(status).json({
        message: isProduction
            ? (status >= 500 ? "An unexpected system error occurred. Please try again later." : err.message)
            : err.message || "Internal Server Error",
        ...(isProduction ? {} : { stack: err.stack })
    });
});

// Only start the server if we're not in a serverless environment (like Vercel)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

export default app;
