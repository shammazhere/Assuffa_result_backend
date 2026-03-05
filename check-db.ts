import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();

async function check() {
    console.log("Current DATABASE_URL starting with:", process.env.DATABASE_URL?.substring(0, 30));
    try {
        const adminCount = await prisma.admin.count();
        console.log(`Successfully queried Admin count: ${adminCount}`);
    } catch (error) {
        console.error("Check failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

check();
