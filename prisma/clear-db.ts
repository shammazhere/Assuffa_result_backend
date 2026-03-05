import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    if (process.env.NODE_ENV === 'production' && process.env.CONFIRM_DELETE !== 'true') {
        console.error("❌ CRITICAL: Attempted to run clear-db in production without CONFIRM_DELETE=true.");
        process.exit(1);
    }
    console.log("🧹 Clearing database...");

    // Delete records in order of dependencies
    await prisma.mark.deleteMany();
    console.log("Deleted all marks");

    await prisma.student.deleteMany();
    console.log("Deleted all students");

    await prisma.subject.deleteMany();
    console.log("Deleted all subjects");

    await prisma.class.deleteMany();
    console.log("Deleted all classes");

    console.log("✅ Database cleared successfully! Ready for fresh data entry.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
