import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import * as OTPAuth from "otpauth";

let mfa: typeof import("./mfa.js");

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/db";
  process.env.JWT_ACCESS_SECRET ??= "test-only-secret-that-is-long-enough-123";
  mfa = await import("./mfa.js");
});

const codeAt = (secret: string, timestamp: number) =>
  new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate({ timestamp });

describe("secret encryption", () => {
  const key = randomBytes(32);

  it("round-trips and never stores the plain secret", () => {
    const stored = mfa.encryptSecret("JBSWY3DPEHPK3PXP", key);
    expect(stored).not.toContain("JBSWY3DPEHPK3PXP");
    expect(mfa.decryptSecret(stored, key)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("uses a fresh nonce each time", () => {
    expect(mfa.encryptSecret("same", key)).not.toBe(mfa.encryptSecret("same", key));
  });

  it("refuses the wrong key and tampered data", () => {
    const stored = mfa.encryptSecret("JBSWY3DPEHPK3PXP", key);
    expect(() => mfa.decryptSecret(stored, randomBytes(32))).toThrow();
    const parts = stored.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => mfa.decryptSecret(parts.join(":"), key)).toThrow();
  });
});

describe("TOTP verification", () => {
  const secret = OTPAuth.Secret.fromHex("0123456789abcdef0123456789abcdef01234567").base32;
  const now = Date.UTC(2026, 10, 17, 10, 0, 0);

  it("accepts the current code and returns its time step", () => {
    expect(mfa.verifyTotp(secret, codeAt(secret, now), null, now)).toBe(mfa.currentStep(now));
  });

  it("tolerates one step of clock drift but not more", () => {
    expect(mfa.verifyTotp(secret, codeAt(secret, now - 30_000), null, now)).toBe(mfa.currentStep(now) - 1);
    expect(mfa.verifyTotp(secret, codeAt(secret, now + 30_000), null, now)).toBe(mfa.currentStep(now) + 1);
    expect(mfa.verifyTotp(secret, codeAt(secret, now - 90_000), null, now)).toBeNull();
  });

  it("rejects a code that was already used (replay)", () => {
    const step = mfa.verifyTotp(secret, codeAt(secret, now), null, now)!;
    expect(mfa.verifyTotp(secret, codeAt(secret, now), step, now)).toBeNull();
    // an older code than the last used step is refused too
    expect(mfa.verifyTotp(secret, codeAt(secret, now - 30_000), step, now)).toBeNull();
  });

  it("rejects malformed input and wrong codes", () => {
    expect(mfa.verifyTotp(secret, "12345", null, now)).toBeNull();
    expect(mfa.verifyTotp(secret, "abcdef", null, now)).toBeNull();
    expect(mfa.verifyTotp(secret, "000000", null, now)).toBeNull();
  });

  it("ignores spaces in a pasted code", () => {
    const code = codeAt(secret, now);
    expect(mfa.verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, null, now)).not.toBeNull();
  });

  it("produces a scannable otpauth URI naming the issuer and account", () => {
    const uri = mfa.provisioningUri(secret, "owner@example.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("owner%40example.com");
    expect(uri).toContain("secret=" + secret);
  });
});

describe("recovery codes", () => {
  it("generates unique, readable codes", () => {
    const codes = mfa.generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
  });

  it("hashes consistently regardless of case, dashes and spaces", () => {
    expect(mfa.hashRecoveryCode("abcde-fgh23")).toBe(mfa.hashRecoveryCode("ABCDE FGH23"));
    expect(mfa.hashRecoveryCode("ABCDE-FGH23")).not.toBe(mfa.hashRecoveryCode("ABCDE-FGH24"));
    expect(mfa.hashRecoveryCode("ABCDE-FGH23")).not.toContain("ABCDE");
  });
});

describe("sign-in challenge token", () => {
  it("round-trips the user and token version", () => {
    expect(mfa.verifyMfaToken(mfa.signMfaToken("user-1", 3))).toEqual({ userId: "user-1", tokenVersion: 3 });
  });

  it("rejects garbage", () => {
    expect(mfa.verifyMfaToken("not-a-token")).toBeNull();
  });
});
