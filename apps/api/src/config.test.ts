import { afterEach, describe, expect, it, vi } from "vitest";
import { configSchema } from "./config.js";

const baseConfig = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://cit_lms:password@db.example.test:5432/cit_lms",
  WEB_ORIGIN: "https://cit-lms.example",
  COOKIE_SECURE: "true",
};

afterEach(() => vi.unstubAllEnvs());

describe("production configuration", () => {
  it("rejects local filesystem storage in production", () => {
    const result = configSchema.safeParse({ ...baseConfig, STORAGE_DRIVER: "local" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.path.includes("STORAGE_DRIVER"))).toBe(true);
  });

  it("rejects insecure cookies and the localhost origin in production", () => {
    const result = configSchema.safeParse({ ...baseConfig, COOKIE_SECURE: "false", WEB_ORIGIN: "http://localhost:3000" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.path.includes("COOKIE_SECURE"))).toBe(true);
      expect(result.error.issues.some(issue => issue.path.includes("WEB_ORIGIN"))).toBe(true);
    }
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
      SUPABASE_ANON_KEY: "test-anon-key",
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
      SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key"
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.MAX_UPLOAD_BYTES).toBe(4_194_304);
  });
});