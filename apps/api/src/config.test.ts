import { afterEach, describe, expect, it, vi } from "vitest";
import { configSchema } from "./config.js";

const baseConfig = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://cit_lms:password@db.example.test:5432/cit_lms",
  JWT_ACCESS_SECRET: "test-only-secret-that-is-long-enough",
  COOKIE_SECURE: "true",
  MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64")
};

afterEach(() => vi.unstubAllEnvs());

describe("production configuration", () => {
  it("rejects local filesystem storage in production", () => {
    const result = configSchema.safeParse({ ...baseConfig, STORAGE_DRIVER: "local" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.path.includes("STORAGE_DRIVER"))).toBe(true);
  });

  it("requires server-side Supabase credentials when Supabase Storage is selected", () => {
    const result = configSchema.safeParse({ ...baseConfig, STORAGE_DRIVER: "supabase" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.path.includes("SUPABASE_URL"))).toBe(true);
      expect(result.error.issues.some(issue => issue.path.includes("SUPABASE_SERVICE_ROLE_KEY"))).toBe(true);
    }
  });

  it("accepts production Supabase Storage configuration", () => {
    const result = configSchema.safeParse({
      ...baseConfig,
      STORAGE_DRIVER: "supabase",
      SUPABASE_URL: "https://cit-lms.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key"
    });

    expect(result.success).toBe(true);
  });

  it("rejects upload limits above Vercel's request-body limit", () => {
    vi.stubEnv("VERCEL", "1");
    const result = configSchema.safeParse({
      ...baseConfig,
      STORAGE_DRIVER: "supabase",
      SUPABASE_URL: "https://cit-lms.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
      MAX_UPLOAD_BYTES: 10_485_760
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.path.includes("MAX_UPLOAD_BYTES"))).toBe(true);
  });

  it("defaults Vercel uploads to 4 MiB when no limit is configured", () => {
    vi.stubEnv("VERCEL", "1");
    const result = configSchema.safeParse({
      ...baseConfig,
      STORAGE_DRIVER: "supabase",
      SUPABASE_URL: "https://cit-lms.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key"
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.MAX_UPLOAD_BYTES).toBe(4_194_304);
  });

  it("requires secure session cookies in production", () => {
    const supabase = { STORAGE_DRIVER: "supabase", SUPABASE_URL: "https://cit-lms.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key" };
    const insecure = configSchema.safeParse({ ...baseConfig, ...supabase, COOKIE_SECURE: "false" });
    expect(insecure.success).toBe(false);
    if (!insecure.success) expect(insecure.error.issues.some(issue => issue.path.includes("COOKIE_SECURE"))).toBe(true);
    expect(configSchema.safeParse({ ...baseConfig, ...supabase, COOKIE_SECURE: "true" }).success).toBe(true);
  });

  it("only allows SameSite=None cookies when they are also Secure", () => {
    const result = configSchema.safeParse({ ...baseConfig, NODE_ENV: "development", COOKIE_SAMESITE: "none", COOKIE_SECURE: "false" });
    expect(result.success).toBe(false);
    expect(configSchema.safeParse({ ...baseConfig, NODE_ENV: "development", COOKIE_SAMESITE: "none", COOKIE_SECURE: "true" }).success).toBe(true);
  });

  it("defaults to SameSite=Strict", () => {
    const result = configSchema.safeParse({ ...baseConfig, NODE_ENV: "development" });
    expect(result.success && result.data.COOKIE_SAMESITE).toBe("strict");
  });

  it("requires an MFA encryption key in production", () => {
    const supabase = { STORAGE_DRIVER: "supabase", SUPABASE_URL: "https://cit-lms.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key" };
    const { MFA_ENCRYPTION_KEY: _omit, ...withoutKey } = baseConfig;
    const result = configSchema.safeParse({ ...withoutKey, ...supabase });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.path.includes("MFA_ENCRYPTION_KEY"))).toBe(true);
  });

  it("rejects an MFA encryption key that is not 32 bytes", () => {
    const result = configSchema.safeParse({ ...baseConfig, NODE_ENV: "development", MFA_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64") });
    expect(result.success).toBe(false);
  });

  it("allows MFA to be switched off in production only through the explicit setting", () => {
    const supabase = { STORAGE_DRIVER: "supabase", SUPABASE_URL: "https://cit-lms.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key" };
    expect(configSchema.safeParse({ ...baseConfig, ...supabase, MFA_REQUIRED: "false" }).success).toBe(true);
    // the encryption key is still mandatory, so already-enrolled accounts keep working
    const { MFA_ENCRYPTION_KEY: _omit, ...withoutKey } = baseConfig;
    expect(configSchema.safeParse({ ...withoutKey, ...supabase, MFA_REQUIRED: "false" }).success).toBe(false);
  });

});
