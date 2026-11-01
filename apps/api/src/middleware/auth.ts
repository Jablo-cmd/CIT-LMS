import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "../db";
import type { UserRole } from "@prisma/client";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.cit_session as string | undefined;
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    if (typeof payload.sub !== "string") return res.status(401).json({ error: "Invalid session" });
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, role: true, isActive: true } });
    if (!user || !user.isActive) return res.status(401).json({ error: "Account unavailable" });
    req.auth = { userId: user.id, email: user.email, role: user.role };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

export function allowRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Authentication required" });
    if (!roles.includes(req.auth.role)) return res.status(403).json({ error: "Insufficient permissions" });
    return next();
  };
}

export const isManagement = allowRoles("COMPANY_OWNER", "HR_MANAGER");
export const isOwner = allowRoles("COMPANY_OWNER");
