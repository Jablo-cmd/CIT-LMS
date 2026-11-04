-- ARCHIVED LEGACY MIGRATION: NOT SAFE FOR THE EXISTING CIT-LMS SUPABASE DATABASE.
-- This migration describes the original repository schema and is retained only for historical reference.
-- Do not apply it to production or restore it under prisma/migrations.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('COMPANY_OWNER', 'HR_MANAGER', 'ADMIN_PERSONNEL');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('PERMANENT', 'CONTRACT');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'RESIGNED', 'DISMISSED', 'DECEASED');

-- CreateEnum
CREATE TYPE "LeaveCategory" AS ENUM ('ANNUAL', 'SICK', 'FAMILY_RESPONSIBILITY', 'MATERNITY', 'PATERNITY_PARENTAL', 'UNPAID', 'STUDY', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveTransactionType" AS ENUM ('DEDUCTION', 'ADJUSTMENT', 'REVERSAL', 'VOID');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('ACADEMIC_QUALIFICATION', 'PROFESSIONAL_CERTIFICATE', 'TRAINING_CERTIFICATE', 'IDENTITY_PERSONAL', 'EMPLOYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DisciplinaryOutcome" AS ENUM ('PENDING', 'NO_ACTION', 'VERBAL_WARNING', 'WRITTEN_WARNING', 'FINAL_WARNING', 'SUSPENSION', 'DISMISSAL', 'OTHER');

-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('COMMENDATION', 'PERFORMANCE', 'PROMOTION', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nationality" TEXT,
    "photoPath" TEXT,
    "photoUpdatedAt" TIMESTAMP(3),
    "addressStreet" TEXT,
    "addressSuburb" TEXT,
    "addressCity" TEXT,
    "addressProvince" TEXT,
    "addressPostalCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "employmentType" "EmploymentType" NOT NULL,
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "originalHireDate" TIMESTAMP(3) NOT NULL,
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "departmentId" TEXT,
    "currentPosition" TEXT,
    "deployedRole" TEXT,
    "currentPostingId" TEXT,
    "workingScheduleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostingSite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "isHeadOffice" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostingSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentHistory" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "previousPosition" TEXT,
    "newPosition" TEXT,
    "previousDeployedRole" TEXT,
    "newDeployedRole" TEXT,
    "previousPostingId" TEXT,
    "newPostingId" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "managerName" TEXT,
    "notes" TEXT,
    "supportingDocumentId" TEXT,
    "recordedById" TEXT NOT NULL,

    CONSTRAINT "EmploymentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NextOfKin" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "NextOfKin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "description" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workingDays" INTEGER[],
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkingSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'ZA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeavePolicy" (
    "id" TEXT NOT NULL,
    "category" "LeaveCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "entitlementDays" DECIMAL(7,2),
    "accrualPerMonth" DECIMAL(7,3),
    "employmentType" "EmploymentType",
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "carryOverLimit" DECIMAL(7,2),
    "eligibility" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveTransaction" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "policyId" TEXT,
    "category" "LeaveCategory" NOT NULL,
    "type" "LeaveTransactionType" NOT NULL DEFAULT 'DEDUCTION',
    "firstLeaveDate" TIMESTAMP(3),
    "lastLeaveDate" TIMESTAMP(3),
    "formSubmissionDate" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "days" DECIMAL(7,2) NOT NULL,
    "balanceBefore" DECIMAL(9,2),
    "balanceAfter" DECIMAL(9,2),
    "reason" TEXT,
    "referenceNumber" TEXT,
    "capturedById" TEXT NOT NULL,

    CONSTRAINT "LeaveTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvertimeEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "postingSiteId" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "finishTime" TEXT NOT NULL,
    "totalHours" DECIMAL(6,2) NOT NULL,
    "confirmedBy" TEXT NOT NULL,
    "capturedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OvertimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplinaryRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "hearingDate" TIMESTAMP(3) NOT NULL,
    "matter" TEXT NOT NULL,
    "finding" TEXT,
    "outcome" "DisciplinaryOutcome" NOT NULL DEFAULT 'PENDING',
    "sanction" TEXT,
    "notes" TEXT,
    "capturedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisciplinaryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "RecommendationType" NOT NULL,
    "description" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "capturedById" TEXT NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_EmployeeDocumentToLeaveTransaction" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EmployeeDocumentToLeaveTransaction_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_EmployeeDocumentToOvertimeEntry" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EmployeeDocumentToOvertimeEntry_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_EmployeeDocumentToRecommendation" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EmployeeDocumentToRecommendation_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_DisciplinaryRecordToEmployeeDocument" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DisciplinaryRecordToEmployeeDocument_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeNumber_key" ON "Employee"("employeeNumber");

-- CreateIndex
CREATE INDEX "Employee_lastName_firstName_idx" ON "Employee"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Employee_employmentStatus_idx" ON "Employee"("employmentStatus");

-- CreateIndex
CREATE INDEX "Employee_currentPosition_idx" ON "Employee"("currentPosition");

-- CreateIndex
CREATE INDEX "Employee_currentPostingId_idx" ON "Employee"("currentPostingId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PostingSite_code_key" ON "PostingSite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentHistory_supportingDocumentId_key" ON "EmploymentHistory"("supportingDocumentId");

-- CreateIndex
CREATE INDEX "EmploymentHistory_employeeId_effectiveDate_idx" ON "EmploymentHistory"("employeeId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDocument_storagePath_key" ON "EmployeeDocument"("storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "WorkingSchedule_name_key" ON "WorkingSchedule"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PublicHoliday_date_key" ON "PublicHoliday"("date");

-- CreateIndex
CREATE INDEX "PublicHoliday_date_countryCode_idx" ON "PublicHoliday"("date", "countryCode");

-- CreateIndex
CREATE INDEX "LeavePolicy_category_effectiveFrom_effectiveTo_idx" ON "LeavePolicy"("category", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "LeaveTransaction_employeeId_category_capturedAt_idx" ON "LeaveTransaction"("employeeId", "category", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveTransaction_employeeId_category_referenceNumber_key" ON "LeaveTransaction"("employeeId", "category", "referenceNumber");

-- CreateIndex
CREATE INDEX "OvertimeEntry_workDate_employeeId_idx" ON "OvertimeEntry"("workDate", "employeeId");

-- CreateIndex
CREATE INDEX "DisciplinaryRecord_employeeId_hearingDate_idx" ON "DisciplinaryRecord"("employeeId", "hearingDate");

-- CreateIndex
CREATE INDEX "Recommendation_employeeId_date_idx" ON "Recommendation"("employeeId", "date");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "_EmployeeDocumentToLeaveTransaction_B_index" ON "_EmployeeDocumentToLeaveTransaction"("B");

-- CreateIndex
CREATE INDEX "_EmployeeDocumentToOvertimeEntry_B_index" ON "_EmployeeDocumentToOvertimeEntry"("B");

-- CreateIndex
CREATE INDEX "_EmployeeDocumentToRecommendation_B_index" ON "_EmployeeDocumentToRecommendation"("B");

-- CreateIndex
CREATE INDEX "_DisciplinaryRecordToEmployeeDocument_B_index" ON "_DisciplinaryRecordToEmployeeDocument"("B");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_currentPostingId_fkey" FOREIGN KEY ("currentPostingId") REFERENCES "PostingSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_workingScheduleId_fkey" FOREIGN KEY ("workingScheduleId") REFERENCES "WorkingSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_previousPostingId_fkey" FOREIGN KEY ("previousPostingId") REFERENCES "PostingSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_newPostingId_fkey" FOREIGN KEY ("newPostingId") REFERENCES "PostingSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_supportingDocumentId_fkey" FOREIGN KEY ("supportingDocumentId") REFERENCES "EmployeeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NextOfKin" ADD CONSTRAINT "NextOfKin_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicy" ADD CONSTRAINT "LeavePolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveTransaction" ADD CONSTRAINT "LeaveTransaction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveTransaction" ADD CONSTRAINT "LeaveTransaction_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "LeavePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveTransaction" ADD CONSTRAINT "LeaveTransaction_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeEntry" ADD CONSTRAINT "OvertimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeEntry" ADD CONSTRAINT "OvertimeEntry_postingSiteId_fkey" FOREIGN KEY ("postingSiteId") REFERENCES "PostingSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeEntry" ADD CONSTRAINT "OvertimeEntry_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryRecord" ADD CONSTRAINT "DisciplinaryRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryRecord" ADD CONSTRAINT "DisciplinaryRecord_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmployeeDocumentToLeaveTransaction" ADD CONSTRAINT "_EmployeeDocumentToLeaveTransaction_A_fkey" FOREIGN KEY ("A") REFERENCES "EmployeeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmployeeDocumentToLeaveTransaction" ADD CONSTRAINT "_EmployeeDocumentToLeaveTransaction_B_fkey" FOREIGN KEY ("B") REFERENCES "LeaveTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmployeeDocumentToOvertimeEntry" ADD CONSTRAINT "_EmployeeDocumentToOvertimeEntry_A_fkey" FOREIGN KEY ("A") REFERENCES "EmployeeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmployeeDocumentToOvertimeEntry" ADD CONSTRAINT "_EmployeeDocumentToOvertimeEntry_B_fkey" FOREIGN KEY ("B") REFERENCES "OvertimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmployeeDocumentToRecommendation" ADD CONSTRAINT "_EmployeeDocumentToRecommendation_A_fkey" FOREIGN KEY ("A") REFERENCES "EmployeeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmployeeDocumentToRecommendation" ADD CONSTRAINT "_EmployeeDocumentToRecommendation_B_fkey" FOREIGN KEY ("B") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DisciplinaryRecordToEmployeeDocument" ADD CONSTRAINT "_DisciplinaryRecordToEmployeeDocument_A_fkey" FOREIGN KEY ("A") REFERENCES "DisciplinaryRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DisciplinaryRecordToEmployeeDocument" ADD CONSTRAINT "_DisciplinaryRecordToEmployeeDocument_B_fkey" FOREIGN KEY ("B") REFERENCES "EmployeeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

