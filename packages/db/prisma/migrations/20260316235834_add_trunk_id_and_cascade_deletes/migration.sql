-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_agentId_fkey";

-- DropForeignKey
ALTER TABLE "Call" DROP CONSTRAINT "Call_agentId_fkey";

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "liveKitTrunkId" TEXT;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
