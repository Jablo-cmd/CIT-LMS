import "dotenv/config";
import { prisma } from "../db.js";

// Emergency access recovery for when nobody can sign in to reset MFA from the app (for example the only Company
// Owner lost their authenticator and recovery codes). Run on a trusted machine with the production DATABASE_URL:
//   npm run owner:reset-mfa --workspace @cit-lms/api -- someone@example.com
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run owner:reset-mfa --workspace @cit-lms/api -- <email>");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No account found for ${email}`);
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecretEnc: null, mfaLastStep: null, mfaEnrolledAt: null, tokenVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null } });
  await prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "MFA_RESET", entityType: "User", entityId: user.id, userAgent: "owner:reset-mfa script" } });
  console.log(`MFA cleared for ${email}. They must set it up again at their next sign-in.`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
