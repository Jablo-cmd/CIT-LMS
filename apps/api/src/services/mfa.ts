import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import jwt from "jsonwebtoken";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { config } from "../config.js";

const STEP_SECONDS = 30;
const MFA_TOKEN_TTL_SECONDS = 5 * 60;
const RECOVERY_CODE_COUNT = 10;
// No 0/O/1/I/L so codes can be read aloud or copied by hand without ambiguity.
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Encrypts a TOTP secret for storage (AES-256-GCM). Output format: v1:iv:tag:ciphertext, all base64. */
export function encryptSecret(plain: string, key: Buffer = config.mfaKey): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(stored: string, key: Buffer = config.mfaKey): string {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Unsupported MFA secret format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function generateSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totpFor(secretBase32: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: config.MFA_ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: STEP_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secretBase32)
  });
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

/**
 * Checks a 6-digit code against the secret, allowing one step of clock drift either way.
 * A step at or before `lastUsedStep` is rejected so a code cannot be replayed.
 * Returns the matched step, or null when the code is wrong or already used.
 */
export function verifyTotp(secretBase32: string, token: string, lastUsedStep: number | null, now = Date.now()): number | null {
  const cleaned = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return null;
  const delta = totpFor(secretBase32, "verify").validate({ token: cleaned, window: 1, timestamp: now });
  if (delta === null) return null;
  const step = currentStep(now) + delta;
  return lastUsedStep !== null && step <= lastUsedStep ? null : step;
}

export function provisioningUri(secretBase32: string, accountEmail: string): string {
  return totpFor(secretBase32, accountEmail).toString();
}

export function qrCodeDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 224, color: { dark: "#293549", light: "#ffffff" } });
}

/** Generates human-friendly one-time recovery codes such as ABCDE-FGH23. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Recovery codes are ~50 bits of randomness, so a plain SHA-256 is sufficient (they are never user-chosen). */
export function hashRecoveryCode(input: string): string {
  return createHash("sha256").update(`cit-lms-recovery:${normalizeRecoveryCode(input)}`).digest("hex");
}

/** A short-lived token proving the password step succeeded; it is NOT a session and is rejected as one. */
export function signMfaToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ purpose: "mfa-login", tokenVersion }, config.JWT_ACCESS_SECRET, { subject: userId, expiresIn: MFA_TOKEN_TTL_SECONDS });
}

export function verifyMfaToken(token: string): { userId: string; tokenVersion: number } | null {
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    if (payload.purpose !== "mfa-login" || typeof payload.sub !== "string" || typeof payload.tokenVersion !== "number") return null;
    return { userId: payload.sub, tokenVersion: payload.tokenVersion };
  } catch {
    return null;
  }
}
