-- DropIndex
DROP INDEX "Appointment_agentId_idx";

-- DropIndex
DROP INDEX "Call_agentId_idx";

-- CreateIndex
CREATE INDEX "Agent_userId_status_idx" ON "Agent"("userId", "status");

-- CreateIndex
CREATE INDEX "Agent_phoneNumber_idx" ON "Agent"("phoneNumber");

-- CreateIndex
CREATE INDEX "Appointment_agentId_scheduledAt_idx" ON "Appointment"("agentId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_agentId_patientPhone_idx" ON "Appointment"("agentId", "patientPhone");

-- CreateIndex
CREATE INDEX "Call_agentId_createdAt_idx" ON "Call"("agentId", "createdAt");
