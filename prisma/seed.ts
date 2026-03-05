import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Starting fresh seed setup...");

    // ── 1. Create or Reset Admin ───────────────────────────
    const hashedPassword = await bcrypt.hash("admin123", 10);
    await prisma.admin.upsert({
        where: { username: "admin" },
        update: { password_hash: hashedPassword },
        create: {
            username: "admin",
            password_hash: hashedPassword,
        },
    });
    console.log("✅ Admin credentials verified (username: admin | password: admin123)");

    console.log("\n🎉 Seed complete! Start adding students manually through your dashboard.\n");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
