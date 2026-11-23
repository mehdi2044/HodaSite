import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient();
// Production server bundles can evaluate this module in distinct contexts.
// Reuse one client on the shared Node global in every mode.
globalForPrisma.prisma = db;
