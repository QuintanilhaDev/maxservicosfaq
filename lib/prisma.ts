import { PrismaClient } from "@prisma/client";

// Evita múltiplas instâncias do Prisma Client em dev (hot-reload do Next.js)
// e mantém apenas uma conexão em ambiente serverless (Vercel).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
