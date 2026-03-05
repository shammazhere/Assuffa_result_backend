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

// Since we use vercel.json for CORS, we don't need the middleware here.
// This prevents header duplication that causes 500 errors.
app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false
}));

app.use(express.json());
app.use(cookieParser());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: "Too many requests from this IP, please try again later." }
});
app.use(limiter);

// Mount routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

app.get(["/", "/api", "/health"], (req, res) => {
    res.status(200).json({
        name: "As-Swuffah Results Management API",
        version: "1.0.0",
        status: "operational",
        environment: process.env.NODE_ENV || "production"
    });
});

// JSON based 404
app.use((req, res) => {
    res.status(404).json({ message: "API route not found" });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const status = err.status || 500;
    console.error(`[ERROR] ${req.method} ${req.url}:`, err);
    res.status(status).json({
        message: "An error occurred. Check backend logs for details.",
        error: process.env.NODE_ENV === 'production' ? {} : err.message
    });
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

export default app;
