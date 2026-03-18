/*
  Warnings:

  - You are about to drop the column `smsEnabled` on the `Agent` table. All the data in the column will be lost.
  - You are about to drop the `SmsConversation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SmsMessage` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM ('CUSTOMER', 'BOT', 'OWNER');

-- CreateEnum
CREATE TYPE "MessagingStatus" AS ENUM ('ACTIVE', 'NEEDS_REPLY', 'RESOLVED');

-- CreateEnum
CREATE TYPE "WhatsAppStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'FAILED');

-- DropForeignKey
ALTER TABLE "SmsConversation" DROP CONSTRAINT "SmsConversation_agentId_fkey";

-- DropForeignKey
ALTER TABLE "SmsMessage" DROP CONSTRAINT "SmsMessage_conversationId_fkey";

-- AlterTable
ALTER TABLE "Agent" DROP COLUMN "smsEnabled",
ADD COLUMN     "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappRegisteredNumber" TEXT,
ADD COLUMN     "whatsappStatus" "WhatsAppStatus" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "reminderSent" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "SmsConversation";

-- DropTable
DROP TABLE "SmsMessage";

-- DropEnum
DROP TYPE "SmsConversationStatus";

-- DropEnum
DROP TYPE "SmsDirection";

-- DropEnum
DROP TYPE "SmsSender";

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'WHATSAPP',
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "status" "MessagingStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "body" TEXT NOT NULL,
    "twilioSid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_agentId_status_idx" ON "Conversation"("agentId", "status");

-- CreateIndex
CREATE INDEX "Conversation_agentId_lastMessageAt_idx" ON "Conversation"("agentId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_agentId_customerPhone_channel_key" ON "Conversation"("agentId", "customerPhone", "channel");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Appointment_scheduledAt_status_reminderSent_idx" ON "Appointment"("scheduledAt", "status", "reminderSent");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
