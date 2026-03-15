-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('COMPLETED', 'MISSED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('GOOGLE_CALENDAR', 'TWILIO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB NOT NULL,
    "voiceSettings" JSONB,
    "phoneNumber" TEXT,
    "liveKitDispatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "callerNumber" TEXT,
    "duration" INTEGER,
    "outcome" "CallOutcome" NOT NULL,
    "transcript" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "callId" TEXT,
    "patientName" TEXT NOT NULL,
    "patientPhone" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "service" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "calendarEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuilderConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "generatedConfig" JSONB,
    "status" "ConversationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuilderConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Agent_userId_idx" ON "Agent"("userId");

-- CreateIndex
CREATE INDEX "Call_agentId_idx" ON "Call"("agentId");

-- CreateIndex
CREATE INDEX "Appointment_agentId_idx" ON "Appointment"("agentId");

-- CreateIndex
CREATE INDEX "Appointment_callId_idx" ON "Appointment"("callId");

-- CreateIndex
CREATE INDEX "BuilderConversation_userId_idx" ON "BuilderConversation"("userId");

-- CreateIndex
CREATE INDEX "Integration_userId_idx" ON "Integration"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_userId_provider_key" ON "Integration"("userId", "provider");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuilderConversation" ADD CONSTRAINT "BuilderConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

