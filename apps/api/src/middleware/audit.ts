import type { Request } from "express";
import { prisma } from "../db.js";

export async function writeAudit(req: Request, action: string, entityType: string, entityId?: string, beforeData?: unknown, afterData?: unknown) {
  await prisma.auditLog.create({
    data: {
      userId: req.auth?.userId,
      action,
      entityType,
      entityId,
      beforeData: beforeData === undefined ? undefined : JSON.parse(JSON.stringify(beforeData)),
      afterData: afterData === undefined ? undefined : JSON.parse(JSON.stringify(afterData)),
      ipAddress: req.ip,
      userAgent: req.get("user-agent")?.slice(0, 500)
    }
  });
}
