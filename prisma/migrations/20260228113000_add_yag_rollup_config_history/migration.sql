CREATE TABLE IF NOT EXISTS "YagRollupConfigHistory" (
    "id" TEXT NOT NULL,
    "configSingletonKey" TEXT NOT NULL DEFAULT 'primary',
    "targetAccountKey" TEXT NOT NULL,
    "sourceAccountKeys" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "scheduleIntervalHours" INTEGER NOT NULL,
    "scheduleMinuteUtc" INTEGER NOT NULL,
    "fullSyncEnabled" BOOLEAN NOT NULL,
    "fullSyncHourUtc" INTEGER NOT NULL,
    "fullSyncMinuteUtc" INTEGER NOT NULL,
    "scrubInvalidEmails" BOOLEAN NOT NULL,
    "scrubInvalidPhones" BOOLEAN NOT NULL,
    "changedFields" TEXT NOT NULL DEFAULT '[]',
    "changedByUserId" TEXT,
    "changedByUserName" TEXT,
    "changedByUserEmail" TEXT,
    "changedByUserRole" TEXT,
    "changedByUserAvatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YagRollupConfigHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "YagRollupConfigHistory_configSingletonKey_createdAt_idx"
ON "YagRollupConfigHistory"("configSingletonKey", "createdAt");

CREATE INDEX IF NOT EXISTS "YagRollupConfigHistory_changedByUserId_createdAt_idx"
ON "YagRollupConfigHistory"("changedByUserId", "createdAt");
