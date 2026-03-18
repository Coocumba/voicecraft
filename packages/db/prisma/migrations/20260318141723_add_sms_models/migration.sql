-- CreateEnum
CREATE TYPE "SmsConversationStatus" AS ENUM ('ACTIVE', 'NEEDS_REPLY', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SmsDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "SmsSender" AS ENUM ('CUSTOMER', 'BOT', 'OWNER');

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "smsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SmsConversation" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "status" "SmsConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "SmsDirection" NOT NULL,
    "sender" "SmsSender" NOT NULL,
    "body" TEXT NOT NULL,
    "twilioSid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsConversation_agentId_status_idx" ON "SmsConversation"("agentId", "status");

-- CreateIndex
CREATE INDEX "SmsConversation_agentId_lastMessageAt_idx" ON "SmsConversation"("agentId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmsConversation_agentId_customerPhone_key" ON "SmsConversation"("agentId", "customerPhone");

-- CreateIndex
CREATE INDEX "SmsMessage_conversationId_createdAt_idx" ON "SmsMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "SmsConversation" ADD CONSTRAINT "SmsConversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SmsConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
