import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
}));

app.use(express.json());
app.use(cookieParser());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: "Too many requests from this IP, please try again later." }
});
app.use(limiter);

// Mount routes – handles both /api/auth/* and /auth/* since vercel strips the /api prefix after routing
app.use(["/api/auth", "/auth"], authRoutes);
app.use(["/api/admin", "/admin"], adminRoutes);

app.get(["/", "/api", "/health"], (_req, res) => {
    res.status(200).json({
        name: "As-Swuffah Results Management API",
        version: "1.0.0",
        status: "operational",
        environment: process.env.NODE_ENV || "production"
    });
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
