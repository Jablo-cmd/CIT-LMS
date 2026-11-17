import type { Response } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { config } from "../config.js";

export const sessionCookieName = "cit_session";
export const cookieBase = { httpOnly: true, secure: config.COOKIE_SECURE === "true", sameSite: config.COOKIE_SAMESITE, path: "/" } as const;

/**
 * Signs a session and sets it as the cookie. `mfaVerified` records that the second factor was completed for this
 * session; the auth middleware refuses sessions for MFA-enabled accounts that lack it.
 */
export function issueSession(res: Response, user: { id: string; role: UserRole; tokenVersion: number }, mfaVerified: boolean) {
  const token = jwt.sign({ role: user.role, tokenVersion: user.tokenVersion, mfa: mfaVerified }, config.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: config.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"]
  });
  // Keep the cookie lifetime in step with the token's own expiry so the two cannot diverge.
  const { exp } = jwt.decode(token) as jwt.JwtPayload;
  res.cookie(sessionCookieName, token, { ...cookieBase, maxAge: Math.max(0, (exp ?? 0) * 1000 - Date.now()) });
}

export function clearSession(res: Response) {
  res.clearCookie(sessionCookieName, cookieBase);
}
