import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
    const hash = await bcrypt.hash("admin123", 10);
    const result = await prisma.admin.upsert({
        where: { username: "admin" },
        update: { password_hash: hash },
        create: { username: "admin", password_hash: hash },
    });
    console.log("Admin updated:", result.username);

    // Verify it works
    const admin = await prisma.admin.findUnique({ where: { username: "admin" } });
    if (admin) {
        const match = await bcrypt.compare("admin123", admin.password_hash);
        console.log("Password check 'admin123':", match ? "✅ PASS" : "❌ FAIL");
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
