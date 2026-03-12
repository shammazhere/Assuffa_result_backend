import { PrismaClient } from '@prisma/client';

declare global {
    var prisma: PrismaClient | undefined;
}

const prisma = global.prisma || new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    errorFormat: 'pretty',
});

// Production tuning for high-concurrency (100+ students)
if (process.env.NODE_ENV === 'production') {
    // Note: Pool size is usually set via DATABASE_URL query param (e.g. ?connection_limit=20)
    // We can also add middleware here to track query durations if needed.
}

if (process.env.NODE_ENV !== 'production') {
    global.prisma = prisma;
}

export { prisma };
