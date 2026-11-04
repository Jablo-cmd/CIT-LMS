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

const poolMax = process.env.VERCEL === "1" ? 1 : Math.max(1, Number(process.env.DB_POOL_MAX) || 10);
const adapter = connectionString
  ? new PrismaPg({ connectionString, max: poolMax, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 10_000 })
  : undefined;

export const prisma = connectionString
  ? (globalForPrisma.prisma ?? new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
    }))
  : unavailablePrismaClient();

if (connectionString && process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
