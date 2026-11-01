import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import argon2 from "argon2";
import { prisma } from "../db.js";

function readHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    stdout.write(question);
    let value = "";
    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 3) { cleanup(); reject(new Error("Password entry cancelled")); return; }
        if (byte === 13 || byte === 10) { cleanup(); stdout.write("\n"); resolve(value); return; }
        if (byte === 8 || byte === 127) { value = value.slice(0, -1); continue; }
        if (byte >= 32 && byte <= 126) value += String.fromCharCode(byte);
      }
    };
    const cleanup = () => {
      stdin.removeListener("data", onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
    };
    if (!stdin.isTTY) { reject(new Error("Owner bootstrap must be run in an interactive terminal")); return; }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function main() {
  const count = await prisma.user.count();
  if (count > 0) throw new Error("Bootstrap is disabled because a user account already exists.");
  const rl = createInterface({ input: stdin, output: stdout });
  let fullName = "";
  let email = "";
  try {
    fullName = (await rl.question("Company Owner full name: ")).trim();
    email = (await rl.question("Company Owner email: ")).trim().toLowerCase();
  } finally { rl.close(); }
  const password = await readHidden("Company Owner password (minimum 14 characters): ");
  if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 14) {
    throw new Error("Invalid name, email, or password length.");
  }
  const passwordHash = await argon2.hash(password);
  await prisma.user.create({ data: { fullName, email, passwordHash, role: "COMPANY_OWNER" } });
  console.log("Initial Company Owner created. Store the credentials securely.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
