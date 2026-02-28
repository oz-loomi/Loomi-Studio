CREATE TABLE IF NOT EXISTS "YagRollupConfig" (
    "id" TEXT NOT NULL,
    "singletonKey" TEXT NOT NULL DEFAULT 'primary',
    "targetAccountKey" TEXT NOT NULL,
    "sourceAccountKeys" TEXT NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scrubInvalidEmails" BOOLEAN NOT NULL DEFAULT true,
    "scrubInvalidPhones" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YagRollupConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "YagRollupConfig_singletonKey_key" ON "YagRollupConfig"("singletonKey");

ALTER TABLE "YagRollupConfig"
ADD COLUMN IF NOT EXISTS "scheduleIntervalHours" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "scheduleMinuteUtc" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN IF NOT EXISTS "fullSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "fullSyncHourUtc" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS "fullSyncMinuteUtc" INTEGER NOT NULL DEFAULT 45;
