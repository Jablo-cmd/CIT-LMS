import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.VERCEL_ENV === "preview" ? undefined : process.env.DATABASE_URL;
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function unavailablePrismaClient(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get() {
      throw new Error("Database access is disabled in restricted Preview mode");
    }
  });
}

function createPrismaClient(): PrismaClient {
  if (!connectionString) return unavailablePrismaClient();
  const poolMax = process.env.VERCEL === "1" ? 1 : Math.max(1, Number(process.env.DB_POOL_MAX) || 10);
  const adapter = new PrismaPg({ connectionString, max: poolMax, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 10_000 });
  return globalForPrisma.prisma ?? new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });
}

export const prisma = createPrismaClient();
if (connectionString && process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
