import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const router = express.Router();

// Generates ALL possible DOB strings that may have been hashed across different upload code versions.
// This is needed because past uploads stored dates in different formats due to code bugs.
// Tries every possible format so login always works regardless of when the student was uploaded.
const generateDobCandidates = (raw: string): string[] => {
    const cleaned = raw.trim();
    const candidates = new Set<string>();
    candidates.add(cleaned); // always try as-is first

    if (cleaned.includes('/')) {
        const parts = cleaned.split('/');
        if (parts.length === 3) {
            const [a, b, c] = parts;
            // Case 1: Input is DD/MM/YYYY (user typed 01/01/2006)
            // The year will be 4 digits and last
            if (c.length === 4) {
                const d = a, m = b, y = c;
                candidates.add(`${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`);  // current format: 01/01/2006
                candidates.add(`${parseInt(d)}/${parseInt(m)}/${y}`);               // unpadded: 1/1/2006
                candidates.add(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);  // YYYY-MM-DD padded
                candidates.add(`${y}-${parseInt(m)}-${parseInt(d)}`);              // YYYY-M-D (v1 bug format)
                candidates.add(`${y}-${m}-${d}`);                                  // YYYY-MM-DD raw parts
            }
        }
    } else if (cleaned.includes('-')) {
        const parts = cleaned.split('-');
        if (parts.length === 3) {
            const [a, b, c] = parts;
            if (a.length === 4) {
                // Input is YYYY-MM-DD or YYYY-M-D
                const y = a, m = b, d = c;
                candidates.add(`${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`);  // DD/MM/YYYY
                candidates.add(`${parseInt(d)}/${parseInt(m)}/${y}`);               // D/M/YYYY
                candidates.add(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);  // YYYY-MM-DD padded
                candidates.add(`${y}-${parseInt(m)}-${parseInt(d)}`);              // YYYY-M-D
                candidates.add(`${y}-${m}-${d}`);                                  // as-is with dashes
            }
        }
    }

    return Array.from(candidates);
};

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
            where: { usn: usn.trim().toUpperCase() },
            include: {
                class: true,
                marks: {
                    include: { subject: true }
                }
            }
        });

        if (!student) {
            return res.status(401).json({ message: `REGISTER NUMBER NOT FOUND: ${usn.trim().toUpperCase()}` });
        }

        // Try every possible historic DOB format until one matches the stored hash
        const candidates = generateDobCandidates(dob);
        let isMatch = false;
        for (const candidate of candidates) {
            const matched = await bcrypt.compare(candidate, student.dob_hash);
            if (matched) { isMatch = true; break; }
        }

        if (!isMatch) {
            return res.status(401).json({ 
                message: "INCORRECT DATE OF BIRTH. The stored data does not match the entered date.",
                triedFormats: candidates.length // helps confirm if candidates are being generated correctly
            });
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
