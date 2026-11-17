-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");

-- CreateIndex
CREATE INDEX "LeaveTransaction_policyId_idx" ON "LeaveTransaction"("policyId");

-- CreateIndex
CREATE INDEX "NextOfKin_employeeId_idx" ON "NextOfKin"("employeeId");

-- CreateIndex
CREATE INDEX "OvertimeEntry_employeeId_idx" ON "OvertimeEntry"("employeeId");
