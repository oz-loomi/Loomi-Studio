CREATE TABLE IF NOT EXISTS "YagRollupRunHistory" (
    "id" TEXT NOT NULL,
    "configSingletonKey" TEXT NOT NULL DEFAULT 'primary',
    "runType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "fullSync" BOOLEAN,
    "wipeMode" TEXT,
    "triggerSource" TEXT,
    "targetAccountKey" TEXT,
    "sourceAccountKeys" TEXT,
    "totals" TEXT,
    "errors" TEXT,
    "triggeredByUserId" TEXT,
    "triggeredByUserName" TEXT,
    "triggeredByUserEmail" TEXT,
    "triggeredByUserRole" TEXT,
    "triggeredByUserAvatarUrl" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YagRollupRunHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "YagRollupRunHistory_configSingletonKey_createdAt_idx"
ON "YagRollupRunHistory"("configSingletonKey", "createdAt");

CREATE INDEX IF NOT EXISTS "YagRollupRunHistory_runType_createdAt_idx"
ON "YagRollupRunHistory"("runType", "createdAt");

CREATE INDEX IF NOT EXISTS "YagRollupRunHistory_triggeredByUserId_createdAt_idx"
ON "YagRollupRunHistory"("triggeredByUserId", "createdAt");
