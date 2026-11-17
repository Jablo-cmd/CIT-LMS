import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { sessionCookieName } from "../services/session.js";
import type { UserRole } from "@prisma/client";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[sessionCookieName] as string | undefined;
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    // A short-lived MFA sign-in token is signed with the same key but must never work as a session.
    if (typeof payload.sub !== "string" || payload.purpose !== undefined) return res.status(401).json({ error: "Invalid session" });
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, role: true, isActive: true, tokenVersion: true, mfaEnabled: true } });
    if (!user || !user.isActive || payload.tokenVersion !== user.tokenVersion) return res.status(401).json({ error: "Account unavailable or session expired" });
    // An account with MFA enabled only accepts sessions that completed the second factor.
    if (user.mfaEnabled && payload.mfa !== true) return res.status(401).json({ error: "Multi-factor verification required" });
    req.auth = { userId: user.id, email: user.email, role: user.role, mfaEnabled: user.mfaEnabled, mfaEnrollmentRequired: !user.mfaEnabled && config.mfaRequired };
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

/**
 * When MFA is required but the user has not enrolled yet, their session may only be used to enrol.
 * Everything behind this middleware is refused until they do.
 */
export function requireMfaEnrolled(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.mfaEnrollmentRequired) {
    return res.status(403).json({ error: "Set up multi-factor authentication to continue", code: "MFA_SETUP_REQUIRED" });
  }
  return next();
}
