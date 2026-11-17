import type { Request } from "express";
import { prisma } from "../db.js";

// Account lockout lives in the database rather than process memory, so it holds across serverless instances.
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

export function isLocked(user: { lockedUntil: Date | null }): boolean {
  return !!user.lockedUntil && user.lockedUntil > new Date();
}

/** Counts a failed password or second-factor attempt, locking the account once the limit is reached. */
export async function recordFailedAttempt(req: Request, userId: string): Promise<void> {
  const { failedLoginCount } = await prisma.user.update({ where: { id: userId }, data: { failedLoginCount: { increment: 1 } }, select: { failedLoginCount: true } });
  if (failedLoginCount >= MAX_FAILED_LOGINS) {
    await prisma.user.update({ where: { id: userId }, data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) } });
    await prisma.auditLog.create({ data: { userId, action: "LOGIN_LOCKOUT", entityType: "User", entityId: userId, ipAddress: req.ip, userAgent: req.get("user-agent")?.slice(0, 500) } });
  }
}
