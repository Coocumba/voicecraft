-- AlterTable: add conversationId to Agent
ALTER TABLE "Agent" ADD COLUMN "conversationId" TEXT;

-- CreateIndex
CREATE INDEX "Agent_conversationId_idx" ON "Agent"("conversationId");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "BuilderConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
