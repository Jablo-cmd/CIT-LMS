import "dotenv/config";
import { createHash } from "node:crypto";
import { z } from "zod";

export const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  // 32 random bytes, base64-encoded (for example `openssl rand -base64 32`). Encrypts MFA secrets at rest and is
  // deliberately separate from JWT_ACCESS_SECRET so rotating one never breaks the other. Required in production.
  MFA_ENCRYPTION_KEY: z.string().optional(),
  // Whether every account must enrol in MFA. Defaults to on in production and off elsewhere.
  MFA_REQUIRED: z.enum(["true", "false"]).optional(),
  MFA_ISSUER: z.string().trim().min(1).max(60).default("CIT-LMS"),
  // Use "strict" or "lax" when the browser reaches the API same-origin (for example through the
  // web app's /api proxy or a shared parent domain). "none" is only for genuinely cross-site hosts
  // and requires COOKIE_SECURE=true; note that many browsers block third-party cookies.
  COOKIE_SAMESITE: z.enum(["strict", "lax", "none"]).default("strict"),
  STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  STORAGE_ROOT: z.string().default("./storage"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("cit-lms-documents"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(() => process.env.VERCEL === "1" ? 4_194_304 : 10_485_760)
}).superRefine((value, ctx) => {
  if (value.MFA_ENCRYPTION_KEY !== undefined && Buffer.from(value.MFA_ENCRYPTION_KEY, "base64").length !== 32) {
    ctx.addIssue({ code: "custom", path: ["MFA_ENCRYPTION_KEY"], message: "MFA_ENCRYPTION_KEY must be 32 random bytes encoded as base64" });
  }
  if (value.NODE_ENV === "production" && !value.MFA_ENCRYPTION_KEY) {
    ctx.addIssue({ code: "custom", path: ["MFA_ENCRYPTION_KEY"], message: "Production requires MFA_ENCRYPTION_KEY" });
  }
  if (value.NODE_ENV === "production" && value.MFA_REQUIRED === "false") {
    ctx.addIssue({ code: "custom", path: ["MFA_REQUIRED"], message: "Production requires multi-factor authentication for every account" });
  }
  if (value.NODE_ENV === "production" && value.COOKIE_SECURE !== "true") {
    ctx.addIssue({ code: "custom", path: ["COOKIE_SECURE"], message: "Production requires COOKIE_SECURE=true so session cookies are only sent over HTTPS" });
  }
  if (value.COOKIE_SAMESITE === "none" && value.COOKIE_SECURE !== "true") {
    ctx.addIssue({ code: "custom", path: ["COOKIE_SAMESITE"], message: "SameSite=None cookies require COOKIE_SECURE=true" });
  }
  if (value.NODE_ENV === "production" && value.STORAGE_DRIVER !== "supabase") {
    ctx.addIssue({ code: "custom", path: ["STORAGE_DRIVER"], message: "Production requires private Supabase Storage" });
  }
  if (value.STORAGE_DRIVER === "supabase") {
    if (!value.SUPABASE_URL) ctx.addIssue({ code: "custom", path: ["SUPABASE_URL"], message: "SUPABASE_URL is required for Supabase Storage" });
    if (!value.SUPABASE_SERVICE_ROLE_KEY) ctx.addIssue({ code: "custom", path: ["SUPABASE_SERVICE_ROLE_KEY"], message: "SUPABASE_SERVICE_ROLE_KEY is required for Supabase Storage" });
  }
  if (process.env.VERCEL === "1" && value.MAX_UPLOAD_BYTES > 4_194_304) {
    ctx.addIssue({ code: "custom", path: ["MAX_UPLOAD_BYTES"], message: "Vercel uploads must be limited to 4 MiB to fit within the function request-body limit" });
  }
});

const parsed = configSchema.parse(process.env);

export const config = {
  ...parsed,
  /** Every account must enrol in MFA. On by default in production. */
  mfaRequired: (parsed.MFA_REQUIRED ?? (parsed.NODE_ENV === "production" ? "true" : "false")) === "true",
  /** 32-byte key for encrypting MFA secrets at rest (derived from the JWT secret outside production only). */
  mfaKey: parsed.MFA_ENCRYPTION_KEY
    ? Buffer.from(parsed.MFA_ENCRYPTION_KEY, "base64")
    : createHash("sha256").update(`cit-lms-mfa-dev-key:${parsed.JWT_ACCESS_SECRET}`).digest()
};
