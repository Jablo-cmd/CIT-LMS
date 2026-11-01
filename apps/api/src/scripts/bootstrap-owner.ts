import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import argon2 from "argon2";
import { prisma } from "../db";

async function main() {
  const count = await prisma.user.count();
  if (count > 0) throw new Error("Bootstrap is disabled because a user account already exists.");
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const fullName = (await rl.question("Company Owner full name: ")).trim();
    const email = (await rl.question("Company Owner email: ")).trim().toLowerCase();
    const password = await rl.question("Strong password (minimum 14 characters): ");
    if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 14) {
      throw new Error("Invalid name, email, or password length.");
    }
    const passwordHash = await argon2.hash(password);
    await prisma.user.create({ data: { fullName, email, passwordHash, role: "COMPANY_OWNER" } });
    console.log("Initial Company Owner created. Store the credentials securely.");
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
