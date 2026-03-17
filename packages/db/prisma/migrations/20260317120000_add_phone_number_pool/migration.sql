-- CreateEnum
CREATE TYPE "PhoneNumberStatus" AS ENUM ('AVAILABLE', 'ASSIGNED');

-- CreateTable
CREATE TABLE "PhoneNumber" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "twilioSid" TEXT NOT NULL,
    "areaCode" TEXT,
    "status" "PhoneNumberStatus" NOT NULL DEFAULT 'AVAILABLE',
    "agentId" TEXT,
    "userId" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneNumber_number_key" ON "PhoneNumber"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneNumber_twilioSid_key" ON "PhoneNumber"("twilioSid");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneNumber_agentId_key" ON "PhoneNumber"("agentId");

-- CreateIndex
CREATE INDEX "PhoneNumber_status_idx" ON "PhoneNumber"("status");

-- CreateIndex
CREATE INDEX "PhoneNumber_areaCode_status_idx" ON "PhoneNumber"("areaCode", "status");

-- CreateIndex
CREATE INDEX "PhoneNumber_userId_status_idx" ON "PhoneNumber"("userId", "status");

-- CreateIndex
CREATE INDEX "PhoneNumber_releasedAt_idx" ON "PhoneNumber"("releasedAt");

-- AddForeignKey
ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: Create PhoneNumber records for existing agents with provisioned numbers
INSERT INTO "PhoneNumber" ("id", "number", "twilioSid", "areaCode", "status", "agentId", "userId", "assignedAt", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    a."phoneNumber",
    a."phoneNumberSid",
    CASE
        WHEN a."phoneNumber" LIKE '+1%' AND LENGTH(a."phoneNumber") = 12
        THEN SUBSTRING(a."phoneNumber" FROM 3 FOR 3)
        ELSE NULL
    END,
    'ASSIGNED'::"PhoneNumberStatus",
    a."id",
    a."userId",
    a."updatedAt",
    NOW(),
    NOW()
FROM "Agent" a
WHERE a."phoneNumberSource" = 'provisioned'
  AND a."phoneNumberSid" IS NOT NULL
  AND a."phoneNumber" IS NOT NULL;
