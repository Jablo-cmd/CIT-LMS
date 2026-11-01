import "dotenv/config";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";

const base = process.env.SMOKE_API_URL ?? "http://127.0.0.1:4000/api";
const suffix = randomUUID().slice(0, 8);
const ownerEmail = `owner-${suffix}@cit-lms.test`;
const hrEmail = `hr-${suffix}@cit-lms.test`;
const adminEmail = `admin-${suffix}@cit-lms.test`;
const initialPassword = `CIT-LMS-CI-${randomUUID()}-A9!`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SMOKE TEST FAILED: ${message}`);
}

async function request(path: string, cookie?: string, method = "GET", body?: unknown, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const raw = response.status === 204 ? "" : await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
  assert(response.status === expectedStatus, `${method} ${path} expected HTTP ${expectedStatus}, received ${response.status}: ${raw.slice(0,500)}`);
  return { response, payload };
}

async function login(email: string, password: string): Promise<string> {
  const { response } = await request("/auth/login", undefined, "POST", { email, password });
  const setCookie = response.headers.get("set-cookie");
  assert(!!setCookie, "login must issue a session cookie");
  return setCookie!.split(";")[0];
}

async function main() {
  const health = await request("/health");
  assert(health.payload.database === "connected", "health check must confirm PostgreSQL connectivity");

  const passwordHash = await argon2.hash(initialPassword);
  const owner = await prisma.user.create({ data: { email: ownerEmail, fullName: "CI Owner", passwordHash, role: "COMPANY_OWNER" } });
  const ownerCookie = await login(ownerEmail, initialPassword);
  const me = await request("/auth/me", ownerCookie);
  assert(me.payload.user.role === "COMPANY_OWNER", "owner login must return correct role");

  const hrPassword = `CIT-HR-${randomUUID()}-B7!`;
  const adminPassword = `CIT-ADMIN-${randomUUID()}-C8!`;
  const hrCreated = await request("/users", ownerCookie, "POST", { email: hrEmail, fullName: "CI HR Manager", password: hrPassword, role: "HR_MANAGER" }, 201);
  const adminCreated = await request("/users", ownerCookie, "POST", { email: adminEmail, fullName: "CI Administrator", password: adminPassword, role: "ADMIN_PERSONNEL" }, 201);
  const hrCookie = await login(hrEmail, hrPassword);
  const adminCookie = await login(adminEmail, adminPassword);

  await request("/users", hrCookie, "GET", undefined, 403);
  await request("/disciplinary", adminCookie, "GET", undefined, 403);
  await request("/reports/overview", adminCookie);
  await request("/reports/leave?year=2026", hrCookie);

  const department = await prisma.department.findFirst();
  const schedule = await prisma.workingSchedule.findFirst({ where: { name: "Standard Monday-Friday" } });
  assert(!!department && !!schedule, "reference seed must create departments and a standard working schedule");
  const employeeNumber = `CI-${suffix.toUpperCase()}`;
  const employeeResult = await request("/employees", ownerCookie, "POST", {
    employeeNumber, firstName: "CI", lastName: "Synthetic Employee",
    employmentType: "PERMANENT", originalHireDate: "2020-01-01",
    departmentId: department!.id, workingScheduleId: schedule!.id
  }, 201);
  const employeeId = employeeResult.payload.employee.id;
  await request("/employees", ownerCookie, "POST", {
    employeeNumber, firstName: "Duplicate", lastName: "Synthetic",
    employmentType: "PERMANENT", originalHireDate: "2020-01-01"
  }, 409);
  await request(`/employees/${employeeId}`, adminCookie, "PATCH", { employmentStatus: "SUSPENDED" }, 403);

  const upload = new FormData();
  upload.set("title", "CI appointment letter");
  upload.set("category", "EMPLOYMENT");
  upload.set("file", new Blob([Buffer.from("%PDF-1.4\nCIT LMS CI test document")], { type: "application/pdf" }), "appointment.pdf");
  const uploadResponse = await fetch(`${base}/documents/${employeeId}`, { method: "POST", headers: { Cookie: hrCookie }, body: upload });
  assert(uploadResponse.status === 201, `employee document upload should succeed, received ${uploadResponse.status}`);
  const uploaded = await uploadResponse.json() as { document: { id: string } };
  const downloaded = await fetch(`${base}/documents/${uploaded.document.id}/download`, { headers: { Cookie: hrCookie } });
  assert(downloaded.status === 200, "authorised HR user must download the uploaded document");
  const downloadedText = Buffer.from(await downloaded.arrayBuffer()).toString("utf8");
  assert(downloadedText.startsWith("%PDF-1.4"), "downloaded document must match uploaded content");

  const identityDoc = await prisma.employeeDocument.create({
    data: {
      employeeId, title: "CI identity record", category: "IDENTITY_PERSONAL",
      originalName: "identity.pdf", storagePath: `${employeeId}/identity-ci.pdf`,
      mimeType: "application/pdf", sizeBytes: 12, uploadedById: hrCreated.payload.user.id
    }
  });
  const adminDocs = await request("/documents", adminCookie);
  assert(!adminDocs.payload.items.some((item: { id: string }) => item.id === identityDoc.id), "administrative personnel must not see identity documents");

  await request(`/postings/history/${employeeId}`, hrCookie, "POST", {
    newPosition: "CI Operations Assistant", effectiveDate: "2020-01-01",
    reason: "Initial appointment for integration verification",
    supportingDocumentId: uploaded.document.id
  }, 201);
  const profile = await request(`/employees/${employeeId}`, hrCookie);
  assert(profile.payload.employee.currentPosition === "CI Operations Assistant", "documented assignment must update current employee position");
  assert(!JSON.stringify(profile.payload).includes("storagePath"), "employee profile must not expose private storage paths");

  await request("/leave/policies", hrCookie, "POST", {
    category: "ANNUAL", name: "CI Annual Leave", entitlementDays: 24,
    accrualPerMonth: 2, employmentType: "PERMANENT", effectiveFrom: "2026-01-01"
  }, 201);
  await request(`/leave/balances/${employeeId}/adjust`, hrCookie, "POST", {
    category: "ANNUAL", days: 5, reason: "CI verified opening balance"
  }, 201);
  const calculation = await request("/leave/calculate", hrCookie, "POST", {
    employeeId, firstLeaveDate: "2026-06-15", lastLeaveDate: "2026-06-17"
  });
  assert(calculation.payload.workingDays === 2, "leave calculation must exclude the seeded Youth Day public holiday");
  const leave = await request("/leave/transactions", hrCookie, "POST", {
    employeeId, category: "ANNUAL", firstLeaveDate: "2026-06-15",
    lastLeaveDate: "2026-06-17", supportingDocumentId: uploaded.document.id,
    reason: "CI leave transaction"
  }, 201);
  assert(leave.payload.calculatedWorkingDays === 2, "leave ledger must deduct calculated working days");
  const balances = await request(`/leave/balances/${employeeId}`, hrCookie);
  assert(Number(balances.payload.balances.ANNUAL) === 3, "leave balance should decrease from five to three days");
  await request(`/leave/transactions/${leave.payload.transaction.id}/reverse`, hrCookie, "POST", { reason: "CI verifies reversal workflow" }, 201);
  const reversedBalance = await request(`/leave/balances/${employeeId}`, hrCookie);
  assert(Number(reversedBalance.payload.balances.ANNUAL) === 5, "reversal must restore the original leave balance");

  await request("/leave/transactions", hrCookie, "POST", {
    employeeId, category: "UNPAID", firstLeaveDate: "2026-06-18",
    lastLeaveDate: "2026-06-18", supportingDocumentId: uploaded.document.id,
    reason: "CI unpaid leave transaction"
  }, 201);

  const oldPolicy = await request("/leave/policies", hrCookie, "POST", {
    category: "ANNUAL", name: "CI 2025 Annual Policy", entitlementDays: 24,
    employmentType: "PERMANENT", effectiveFrom: "2025-01-01",
    effectiveTo: "2025-12-31", carryOverLimit: 4
  }, 201);
  await prisma.leaveTransaction.create({
    data: {
      employeeId, policyId: oldPolicy.payload.policy.id, category: "ANNUAL",
      type: "ADJUSTMENT", days: 8, balanceBefore: 0, balanceAfter: 8,
      reason: "Synthetic 2025 closing balance", referenceNumber: `CI-2025-OPENING-${suffix}`,
      capturedById: hrCreated.payload.user.id, capturedAt: new Date("2025-12-30T12:00:00.000Z")
    }
  });
  const carryover = await request("/leave/carryover/apply", hrCookie, "POST", { year: 2025 });
  assert(carryover.payload.entriesCreated === 1, "year-end carry-over must cap balances above the configured policy limit");
  assert(Number(carryover.payload.entries[0].days) === -4, "carry-over cap must post a negative adjustment for the excess");
  const carryoverAgain = await request("/leave/carryover/apply", hrCookie, "POST", { year: 2025 });
  assert(carryoverAgain.payload.entriesCreated === 0, "year-end carry-over processing must be idempotent");

  const overtime = await request("/overtime", hrCookie, "POST", {
    employeeId, workDate: "2026-06-20", startTime: "09:00", finishTime: "13:30",
    confirmedBy: "CI Test Manager"
  }, 201);
  assert(Number(overtime.payload.entry.totalHours) === 4.5, "weekend overtime must calculate elapsed hours");
  await request("/overtime", hrCookie, "POST", {
    employeeId, workDate: "2026-06-19", startTime: "09:00", finishTime: "13:30",
    confirmedBy: "CI Test Manager"
  }, 400);

  await request("/disciplinary", hrCookie, "POST", {
    employeeId, hearingDate: "2026-06-22", matter: "CI test hearing", outcome: "PENDING"
  }, 201);
  const audit = await request("/audit", ownerCookie);
  assert(audit.payload.items.length > 0, "owner must be able to inspect audit events");

  const changedPassword = `CIT-HR-CHANGED-${randomUUID()}-D9!`;
  await request("/auth/change-password", hrCookie, "POST", { currentPassword: hrPassword, newPassword: changedPassword });
  await request("/auth/me", hrCookie, "GET", undefined, 401);
  const changedCookie = await login(hrEmail, changedPassword);
  await request("/auth/me", changedCookie);

  await request("/auth/logout", ownerCookie, "POST", undefined, 204);
  await request("/auth/me", ownerCookie, "GET", undefined, 401);

  console.log("CIT-LMS integration smoke test passed: authentication, roles, employee records, documents, history, leave, overtime, disciplinary access and audit.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
