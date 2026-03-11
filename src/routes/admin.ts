import express from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { adminAuth } from "../middlewares/authMiddleware";
import { prisma } from "../lib/prisma";

const router = express.Router();

router.use(adminAuth);

// --- CLASSES ---
const classSchema = z.object({
    name: z.string().min(1),
    type: z.enum(["Offline", "Online"]).default("Offline")
});

router.get("/classes", async (req, res) => {
    const classes = await prisma.class.findMany();
    res.json(classes);
});

router.post("/classes", async (req, res) => {
    try {
        const { name, type } = classSchema.parse(req.body);
        const upperName = name.trim().toUpperCase();

        // Find if exists
        const exists = await prisma.class.findUnique({
            where: { name_type: { name: upperName, type } }
        });

        if (exists) {
            return res.status(400).json({ error: "Class already exists in this mode." });
        }

        const newClass = await prisma.class.create({
            data: { name: upperName, type }
        });
        res.status(201).json(newClass);
    } catch (error) {
        res.status(400).json({ error: "Failed to create class" });
    }
});

router.delete("/classes/:id", async (req, res) => {
    try {
        await prisma.class.delete({ where: { id: req.params.id } });
        res.json({ message: "Deleted successfully" });
    } catch (error) {
        res.status(400).json({ error: "Cannot delete class" });
    }
});

// --- SUBJECTS ---
const subjectSchema = z.object({
    name: z.string().min(1),
    class_id: z.string().min(1)
});

router.get("/subjects", async (req, res) => {
    const { class_id } = req.query;
    const where = class_id ? { class_id: String(class_id) } : {};
    const subjects = await prisma.subject.findMany({ where, include: { class: true } });
    res.json(subjects);
});

router.post("/subjects", async (req, res) => {
    try {
        const { name, class_id } = subjectSchema.parse(req.body);
        const newSubject = await prisma.subject.create({ data: { name, class_id } });
        res.status(201).json(newSubject);
    } catch (error) {
        res.status(400).json({ error: "Invalid data" });
    }
});

router.delete("/subjects/:id", async (req, res) => {
    try {
        await prisma.subject.delete({ where: { id: req.params.id } });
        res.json({ message: "Deleted successfully" });
    } catch (error) {
        res.status(400).json({ error: "Cannot delete subject" });
    }
});

// --- STUDENTS ---
const studentSchema = z.object({
    first_name: z.string().min(1),
    usn: z.string().min(1),
    dob: z.string().min(1),
    class_id: z.string().min(1)
});

router.get("/students", async (req, res) => {
    const { class_id, usn } = req.query;
    let where: any = {};
    if (class_id) where.class_id = String(class_id);
    if (usn) where.usn = { contains: String(usn) };

    const students = await prisma.student.findMany({
        where,
        select: {
            id: true,
            first_name: true,
            usn: true,
            class_id: true,
            class: {
                select: {
                    id: true,
                    name: true,
                    type: true
                }
            }
        },
        orderBy: { usn: 'asc' }
    });
    res.json(students);
});

router.post("/students", async (req, res) => {
    try {
        const { first_name, usn, dob, class_id } = studentSchema.parse(req.body);

        // Validate that the class exists first
        const classExists = await prisma.class.findUnique({ where: { id: class_id } });
        if (!classExists) {
            return res.status(400).json({ error: "Class not found" });
        }

        // Check for duplicate USN
        const existingStudent = await prisma.student.findUnique({ where: { usn } });
        if (existingStudent) {
            return res.status(400).json({ error: `USN "${usn}" already exists. Please use a unique USN.` });
        }

        const dob_hash = await bcrypt.hash(dob, 10);
        const newStudent = await prisma.student.create({
            data: { first_name, usn, dob_hash, class_id },
            include: { class: true }
        });

        // Strip the hash and return full data with class name
        const { dob_hash: _, ...safeStudent } = newStudent;
        return res.status(201).json(safeStudent);
    } catch (error) {
        if (error instanceof Error && error.message.includes('Unique constraint')) {
            return res.status(400).json({ error: "USN already exists." });
        }
        res.status(400).json({ error: "Invalid data provided." });
    }
});

router.delete("/students/:id", async (req, res) => {
    try {
        await prisma.student.delete({ where: { id: req.params.id } });
        res.json({ message: "Deleted successfully" });
    } catch (error) {
        res.status(400).json({ error: "Cannot delete student" });
    }
});

// --- BULK STUDENTS ---
const bulkStudentSchema = z.array(z.object({
    first_name: z.string().min(1),
    usn: z.string().min(1),
    dob: z.string().min(1),
    class_id: z.string().min(1)
}));

router.post("/students/bulk", async (req, res) => {
    try {
        const students = bulkStudentSchema.parse(req.body);

        // Validation: Unique USNs in the incoming batch
        const incomingUsns = students.map(s => s.usn.trim().toUpperCase());
        if (new Set(incomingUsns).size !== incomingUsns.length) {
            return res.status(400).json({ error: "Duplicate USNs found in the uploaded file." });
        }

        // Check if any USN already exists in DB
        const existingInDb = await prisma.student.findMany({
            where: { usn: { in: incomingUsns } },
            select: { usn: true }
        });

        if (existingInDb.length > 0) {
            return res.status(400).json({
                error: `Found ${existingInDb.length} students already registered in the system.`,
                details: existingInDb.map(s => s.usn)
            });
        }

        // Hash DOBS outside transaction for performance and consistency
        const hashedStudents = await Promise.all(students.map(async (s) => {
            const dob_hash = await bcrypt.hash(s.dob.trim(), 10);
            return {
                first_name: s.first_name.trim(),
                usn: s.usn.trim().toUpperCase(),
                dob_hash,
                class_id: s.class_id
            };
        }));

        // Execute as a single transaction
        const createdCount = await prisma.student.createMany({
            data: hashedStudents,
            skipDuplicates: false,
        });

        res.status(201).json({ success: true, count: createdCount.count });
    } catch (error) {
        console.error("Bulk upload error:", error);
        res.status(400).json({ error: "Invalid data format or server error during bulk upload." });
    }
});

// --- MARKS ---
const markSchema = z.object({
    student_id: z.string().min(1),
    subject_id: z.string().min(1),
    total: z.number().min(0).max(100),
    grade: z.string().optional()
});

const calculateGrade = (total: number) => {
    if (total >= 90) return "A+";
    if (total >= 80) return "A";
    if (total >= 70) return "B";
    if (total >= 60) return "C";
    if (total >= 50) return "D";
    return "F";
};

router.get("/marks", async (req, res) => {
    const { class_id } = req.query;
    const where = class_id ? { student: { class_id: String(class_id) } } : {};
    const marks = await prisma.mark.findMany({
        where,
        include: { student: true, subject: true }
    });

    const sanitizedMarks = marks.map((m: any) => {
        delete m.student.dob_hash;
        return m;
    });

    res.json(sanitizedMarks);
});

router.post("/marks", async (req, res) => {
    try {
        const data = markSchema.parse(req.body);
        const grade = data.grade || calculateGrade(data.total);

        const mark = await prisma.mark.upsert({
            where: {
                student_id_subject_id: {
                    student_id: data.student_id,
                    subject_id: data.subject_id
                }
            },
            update: { total: data.total, grade },
            create: { ...data, grade }
        });
        return res.json(mark);
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: "Invalid data" });
    }
});

const bulkMarkSchema = z.array(z.object({
    student_id: z.string().min(1),
    subject_id: z.string().min(1),
    total: z.number().min(0).max(100)
}));

router.post("/marks/bulk", async (req, res) => {
    try {
        const marks = bulkMarkSchema.parse(req.body);

        // Use a transaction for atomic bulk updates
        const results = await prisma.$transaction(
            marks.map((m) => {
                const grade = calculateGrade(m.total);
                return prisma.mark.upsert({
                    where: {
                        student_id_subject_id: {
                            student_id: m.student_id,
                            subject_id: m.subject_id
                        }
                    },
                    update: { total: m.total, grade },
                    create: { ...m, grade }
                });
            })
        );

        res.status(200).json({ success: true, count: results.length });
    } catch (error) {
        console.error("Bulk mark update error:", error);
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Invalid mark data format", details: error.issues });
        }
        res.status(500).json({ error: "Failed to save marks" });
    }
});

// --- COMPREHENSIVE BULK IMPORT ---
router.post("/bulk-complete", async (req, res) => {
    try {
        const payload = req.body; // Array of student data with marks
        let successCount = 0;

        // 1. Pre-process and Hash DOBs in parallel (Faster & prevents transaction timeout)
        const studentsToProcess = await Promise.all(payload.map(async (item: any) => {
            const { dob } = item;
            
            // Mirror of auth.ts Beast-Mode normalization
            const normalizeDateStr = (raw: any): string => {
                let s = String(raw || '').trim().replace(/\s/g, '');
                if (!s) return "";
                if (/^\d{8}$/.test(s)) {
                    return `${s.slice(0, 2)}/${s.slice(2, 4)}/${s.slice(4)}`;
                }
                const parts = s.split(/[/\-.]/);
                if (parts.length === 3) {
                    let [p1, p2, p3] = parts;
                    if (p1.length === 4) {
                        const [y, m, d] = [p1, p2, p3];
                        return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
                    }
                    let d = p1, m = p2, y = p3;
                    if (y.length === 2) {
                        y = (parseInt(y) < 50 ? "20" : "19") + y;
                    }
                    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
                }
                return s;
            };

            const finalDob = normalizeDateStr(dob);
            const dob_hash = await bcrypt.hash(finalDob, 10);
            return { ...item, dob_hash };
        }));

        await prisma.$transaction(async (tx) => {
            for (const studentData of studentsToProcess) {
                const { first_name, usn, dob_hash, class_name, marks } = studentData;
                const class_type_raw = studentData.class_type || studentData.type || studentData.mode || "Offline";
                const class_type = class_type_raw.charAt(0).toUpperCase() + class_type_raw.slice(1).toLowerCase();

                // 1. Find or create class (Standardize both Name and Type)
                const standardizedClassName = String(class_name).trim().toUpperCase();
                let targetClass = await tx.class.findUnique({
                    where: { name_type: { name: standardizedClassName, type: class_type } }
                });

                if (!targetClass) {
                    targetClass = await tx.class.create({
                        data: {
                            name: standardizedClassName,
                            type: class_type
                        }
                    });
                }

                // 3. Upsert Student (Standardize Name to UpperCase)
                const student = await tx.student.upsert({
                    where: { usn: String(usn).trim().toUpperCase() },
                    update: {
                        first_name: String(first_name).trim().toUpperCase(),
                        dob_hash,
                        class_id: targetClass.id
                    },
                    create: {
                        first_name: String(first_name).trim().toUpperCase(),
                        usn: String(usn).trim().toUpperCase(),
                        dob_hash,
                        class_id: targetClass.id
                    }
                });

                // 4. Process Marks
                if (marks && Array.isArray(marks)) {
                    for (const markInfo of marks) {
                        const subName = String(markInfo.subject_name).trim().toUpperCase();

                        // Find or create subject for THIS class
                        let subject = await tx.subject.findFirst({
                            where: { name: subName, class_id: targetClass.id }
                        });

                        if (!subject) {
                            subject = await tx.subject.create({
                                data: { name: subName, class_id: targetClass.id }
                            });
                        }

                        const total = parseInt(markInfo.total);
                        if (!isNaN(total)) {
                            const grade = calculateGrade(total);

                            await tx.mark.upsert({
                                where: {
                                    student_id_subject_id: {
                                        student_id: student.id,
                                        subject_id: subject.id
                                    }
                                },
                                update: { total, grade },
                                create: {
                                    student_id: student.id,
                                    subject_id: subject.id,
                                    total,
                                    grade
                                }
                            });
                        }
                    }
                }
                successCount++;
            }
        }, {
            maxWait: 50000, // 50 seconds max wait to start
            timeout: 300000 // 5 minutes timeout for the entire massive transaction
        });

        res.json({ success: true, count: studentsToProcess.length });
    } catch (error: any) {
        // Detailed logging for Vercel deployment logs
        console.error("CRITICAL SYNC ERROR:", error.message || error);
        res.status(400).json({ error: error.message || "Comprehensive bulk upload failed. Verify data format." });
    }
});

export default router;
