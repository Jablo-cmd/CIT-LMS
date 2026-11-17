import { Router } from "express";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";
import { isLocked, recordFailedAttempt } from "../services/login-throttle.js";
import { issueSession } from "../services/session.js";
import {
  decryptSecret, encryptSecret, generateRecoveryCodes, generateSecret, hashRecoveryCode,
  provisioningUri, qrCodeDataUrl, verifyMfaToken, verifyTotp
} from "../services/mfa.js";

export const mfaRouter = Router();

const codeSchema = z.string().trim().min(6).max(8);

/**
 * Verifies a 6-digit code and atomically claims its time step, so a code that has been used once (or any earlier
 * one) is refused even if two requests race.
 */
async function claimTotp(user: { id: string; mfaSecretEnc: string | null; mfaLastStep: number | null }, code: string): Promise<number | null> {
  if (!user.mfaSecretEnc) return null;
  const step = verifyTotp(decryptSecret(user.mfaSecretEnc), code, user.mfaLastStep);
  if (step === null) return null;
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
    data: { mfaLastStep: step }
  });
  return claimed.count === 1 ? step : null;
}

async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.mfaRecoveryCode.createMany({ data: codes.map(code => ({ userId, codeHash: hashRecoveryCode(code) })) })
  ]);
  return codes;
}

// ---- Second step of signing in (no session yet: authenticated by the short-lived challenge token) ----

const verifySchema = z.object({
  mfaToken: z.string().min(10).max(2000),
  code: codeSchema.optional(),
  recoveryCode: z.string().trim().min(8).max(20).optional()
}).refine(v => (v.code ? 1 : 0) + (v.recoveryCode ? 1 : 0) === 1, { message: "Provide either an authenticator code or a recovery code" });

mfaRouter.post("/verify", async (req, res, next) => {
  try {
    const input = verifySchema.parse(req.body);
    const expired = { error: "Your sign-in has expired. Please sign in again." };
    const challenge = verifyMfaToken(input.mfaToken);
    if (!challenge) return res.status(401).json(expired);
    const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
    if (!user || !user.isActive || !user.mfaEnabled || !user.mfaSecretEnc || user.tokenVersion !== challenge.tokenVersion) return res.status(401).json(expired);
    if (isLocked(user)) return res.status(429).json({ error: "Too many failed attempts. Try again later or ask a Company Owner to reset your access." });

    let usedRecoveryCode = false;
    let ok = false;
    if (input.code) {
      ok = (await claimTotp(user, input.code)) !== null;
    } else if (input.recoveryCode) {
      const used = await prisma.mfaRecoveryCode.updateMany({ where: { userId: user.id, codeHash: hashRecoveryCode(input.recoveryCode), usedAt: null }, data: { usedAt: new Date() } });
      ok = usedRecoveryCode = used.count === 1;
    }
    if (!ok) {
      await recordFailedAttempt(req, user.id);
      return res.status(401).json({ error: input.recoveryCode ? "That recovery code is not valid or has already been used." : "That code is not valid. Check the code in your authenticator app and try again." });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
    const audit = (action: string) => prisma.auditLog.create({ data: { userId: user.id, action, entityType: "User", entityId: user.id, ipAddress: req.ip, userAgent: req.get("user-agent")?.slice(0, 500) } });
    await audit("LOGIN");
    if (usedRecoveryCode) await audit("MFA_RECOVERY_CODE_USED");
    issueSession(res, user, true);
    const recoveryCodesRemaining = await prisma.mfaRecoveryCode.count({ where: { userId: user.id, usedAt: null } });
    return res.json({ user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role }, recoveryCodesRemaining });
  } catch (error) { return next(error); }
});

// ---- Everything below needs a session. Sessions for users who still have to enrol are allowed here. ----
mfaRouter.use(requireAuth);

mfaRouter.get("/status", async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, select: { mfaEnabled: true, mfaEnrolledAt: true } });
    const recoveryCodesRemaining = user.mfaEnabled ? await prisma.mfaRecoveryCode.count({ where: { userId: req.auth!.userId, usedAt: null } }) : 0;
    return res.json({ enabled: user.mfaEnabled, enrolledAt: user.mfaEnrolledAt, required: config.mfaRequired, recoveryCodesRemaining });
  } catch (error) { return next(error); }
});

/** Starts enrolment: creates a fresh secret (not active until confirmed) and returns the QR code for it. */
mfaRouter.post("/setup", async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, select: { id: true, email: true, mfaEnabled: true } });
    if (user.mfaEnabled) return res.status(409).json({ error: "Multi-factor authentication is already turned on for this account." });
    const secret = generateSecret();
    await prisma.user.update({ where: { id: user.id }, data: { mfaSecretEnc: encryptSecret(secret) } });
    const uri = provisioningUri(secret, user.email);
    return res.json({ secret, otpauthUri: uri, qrDataUrl: await qrCodeDataUrl(uri) });
  } catch (error) { return next(error); }
});

/** Confirms enrolment with a first code, switches MFA on and returns the one-time recovery codes. */
mfaRouter.post("/enable", async (req, res, next) => {
  try {
    const { code } = z.object({ code: codeSchema }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
    if (user.mfaEnabled) return res.status(409).json({ error: "Multi-factor authentication is already turned on for this account." });
    if (!user.mfaSecretEnc) return res.status(400).json({ error: "Start the setup first to get a QR code." });
    const step = verifyTotp(decryptSecret(user.mfaSecretEnc), code, null);
    if (step === null) return res.status(400).json({ error: "That code is not valid. Check the code in your authenticator app and try again." });

    // Bumping tokenVersion signs out every other session; this one is re-issued below as fully verified.
    const updated = await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaEnrolledAt: new Date(), mfaLastStep: step, tokenVersion: { increment: 1 } } });
    const recoveryCodes = await replaceRecoveryCodes(user.id);
    await writeAudit(req, "MFA_ENROLLED", "User", user.id);
    issueSession(res, updated, true);
    return res.json({ enabled: true, recoveryCodes });
  } catch (error) { return next(error); }
});

mfaRouter.post("/recovery-codes", async (req, res, next) => {
  try {
    const { code } = z.object({ code: codeSchema }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
    if (!user.mfaEnabled) return res.status(409).json({ error: "Turn on multi-factor authentication first." });
    if ((await claimTotp(user, code)) === null) return res.status(400).json({ error: "That code is not valid. Check the code in your authenticator app and try again." });
    const recoveryCodes = await replaceRecoveryCodes(user.id);
    await writeAudit(req, "MFA_RECOVERY_CODES_REGENERATED", "User", user.id);
    return res.json({ recoveryCodes });
  } catch (error) { return next(error); }
});

/** Turning MFA off is only possible where policy does not require it (never in production). */
mfaRouter.post("/disable", async (req, res, next) => {
  try {
    if (config.mfaRequired) return res.status(403).json({ error: "Multi-factor authentication is required for all accounts and cannot be turned off." });
    const input = z.object({ password: z.string().min(1).max(200), code: codeSchema }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
    if (!user.mfaEnabled) return res.status(409).json({ error: "Multi-factor authentication is not turned on." });
    if (!(await argon2.verify(user.passwordHash, input.password))) return res.status(400).json({ error: "Your password is incorrect." });
    if ((await claimTotp(user, input.code)) === null) return res.status(400).json({ error: "That code is not valid. Check the code in your authenticator app and try again." });
    const updated = await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecretEnc: null, mfaLastStep: null, mfaEnrolledAt: null, tokenVersion: { increment: 1 } } });
    await prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
    await writeAudit(req, "MFA_DISABLED", "User", user.id);
    issueSession(res, updated, false);
    return res.json({ enabled: false });
  } catch (error) { return next(error); }
});
