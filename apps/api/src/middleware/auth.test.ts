import { afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

const secret = "test-only-secret-that-is-long-enough-123";
type User = { id: string; email: string; role: string; isActive: boolean; tokenVersion: number; mfaEnabled: boolean };
const baseUser: User = { id: "u1", email: "a@b.test", role: "HR_MANAGER", isActive: true, tokenVersion: 0, mfaEnabled: false };

async function load(user: User | null, mfaRequired: "true" | "false") {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  vi.stubEnv("JWT_ACCESS_SECRET", secret);
  vi.stubEnv("MFA_REQUIRED", mfaRequired);
  vi.doMock("../db.js", () => ({ prisma: { user: { findUnique: vi.fn().mockResolvedValue(user) } } }));
  return import("./auth.js");
}

function run(mw: (req: any, res: any, next: any) => unknown, cookie?: string) {
  const req: any = { cookies: cookie ? { cit_session: cookie } : {} };
  const res: any = { statusCode: 200, body: undefined as unknown, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  const next = vi.fn();
  return Promise.resolve(mw(req, res, next)).then(() => ({ req, res, next }));
}

const session = (claims: Record<string, unknown> = {}) => jwt.sign({ role: "HR_MANAGER", tokenVersion: 0, ...claims }, secret, { subject: "u1", expiresIn: 60 });

afterEach(() => { vi.doUnmock("../db.js"); vi.unstubAllEnvs(); });

describe("requireAuth with MFA", () => {
  it("never accepts a sign-in challenge token as a session", async () => {
    const { requireAuth } = await load(baseUser, "false");
    const challenge = jwt.sign({ purpose: "mfa-login", tokenVersion: 0 }, secret, { subject: "u1", expiresIn: 60 });
    const { res, next } = await run(requireAuth, challenge);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("refuses a password-only session for an account with MFA enabled", async () => {
    const { requireAuth } = await load({ ...baseUser, mfaEnabled: true }, "true");
    const { res, next } = await run(requireAuth, session({ mfa: false }));
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a session that completed the second factor", async () => {
    const { requireAuth } = await load({ ...baseUser, mfaEnabled: true }, "true");
    const { req, next } = await run(requireAuth, session({ mfa: true }));
    expect(next).toHaveBeenCalled();
    expect(req.auth).toMatchObject({ mfaEnabled: true, mfaEnrollmentRequired: false });
  });

  it("flags an unenrolled user as needing enrolment when MFA is required", async () => {
    const { requireAuth } = await load(baseUser, "true");
    const { req, next } = await run(requireAuth, session({ mfa: false }));
    expect(next).toHaveBeenCalled();
    expect(req.auth.mfaEnrollmentRequired).toBe(true);
  });

  it("does not flag enrolment when MFA is not required", async () => {
    const { requireAuth } = await load(baseUser, "false");
    const { req } = await run(requireAuth, session({ mfa: false }));
    expect(req.auth.mfaEnrollmentRequired).toBe(false);
  });
});

describe("requireMfaEnrolled", () => {
  it("blocks every route until the user has enrolled", async () => {
    const { requireMfaEnrolled } = await load(baseUser, "true");
    const blocked = await run((req, res, next) => { req.auth = { mfaEnrollmentRequired: true }; return requireMfaEnrolled(req, res, next); });
    expect(blocked.res.statusCode).toBe(403);
    expect(blocked.res.body).toMatchObject({ code: "MFA_SETUP_REQUIRED" });
    expect(blocked.next).not.toHaveBeenCalled();
  });

  it("lets enrolled users through", async () => {
    const { requireMfaEnrolled } = await load(baseUser, "true");
    const allowed = await run((req, res, next) => { req.auth = { mfaEnrollmentRequired: false }; return requireMfaEnrolled(req, res, next); });
    expect(allowed.next).toHaveBeenCalled();
  });
});
