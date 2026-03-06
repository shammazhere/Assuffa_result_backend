import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const router = express.Router();

const studentLoginSchema = z.object({
    usn: z.string().min(1, "USN is required"),
    dob: z.string().min(1, "DOB is required")
});

const adminLoginSchema = z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required")
});

router.post("/student/login", async (req, res) => {
    try {
        const { usn, dob } = studentLoginSchema.parse(req.body);

        const student = await prisma.student.findUnique({
            where: { usn },
            include: {
                class: true,
                marks: {
                    include: { subject: true }
                }
            }
        });

        if (!student) {
            return res.status(401).json({ message: "Invalid USN or DOB" });
        }

        const isMatch = await bcrypt.compare(dob, student.dob_hash);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid USN or DOB" });
        }

        const studentData = {
            id: student.id,
            first_name: student.first_name,
            usn: student.usn,
            className: student.class.name,
            classType: student.class.type,
            class: {
                name: student.class.name,
                type: student.class.type
            },
            marks: student.marks.map(m => ({
                subject: m.subject.name,
                total: m.total,
                grade: m.grade
            }))
        };

        return res.status(200).json(studentData);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ message: "Validation error", errors: error.issues });
        }
        console.error("[student/login error]", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

router.post("/admin/login", async (req, res) => {
    try {
        const JWT_SECRET = process.env.JWT_SECRET;
        if (!JWT_SECRET) {
            console.error("JWT_SECRET is not set");
            return res.status(500).json({ message: "Server configuration error" });
        }

        const { username, password } = adminLoginSchema.parse(req.body);

        const admin = await prisma.admin.findUnique({ where: { username } });
        if (!admin) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: admin.id, username: admin.username },
            JWT_SECRET,
            { expiresIn: "1d" }
        );

        // Set cookie + return token in body (token-in-body works across origins)
        res.cookie("token", token, {
            httpOnly: true,
            secure: true,
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: "none"   // MUST be "none" for cross-origin (Vercel frontend ↔ backend)
        });

        return res.status(200).json({ message: "Login successful", token });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ message: "Validation error", errors: error.issues });
        }
        console.error("[admin/login error]", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

router.post("/admin/logout", (_req, res) => {
    res.clearCookie("token", { sameSite: "none", secure: true });
    return res.status(200).json({ message: "Logged out successfully" });
});

export default router;
