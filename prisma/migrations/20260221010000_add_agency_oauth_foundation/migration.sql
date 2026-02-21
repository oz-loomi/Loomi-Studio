-- CreateTable
CREATE TABLE "EspProviderOAuthCredential" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspProviderOAuthCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspAccountProviderLink" (
    "id" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "locationId" TEXT,
    "locationName" TEXT,
    "metadata" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspAccountProviderLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EspProviderOAuthCredential_provider_key" ON "EspProviderOAuthCredential"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "EspAccountProviderLink_accountKey_provider_key" ON "EspAccountProviderLink"("accountKey", "provider");

-- CreateIndex
CREATE INDEX "EspAccountProviderLink_provider_idx" ON "EspAccountProviderLink"("provider");

-- CreateIndex
CREATE INDEX "EspAccountProviderLink_accountKey_idx" ON "EspAccountProviderLink"("accountKey");

-- AddForeignKey
ALTER TABLE "EspAccountProviderLink" ADD CONSTRAINT "EspAccountProviderLink_accountKey_fkey"
  FOREIGN KEY ("accountKey") REFERENCES "Account"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing OAuth account->location mappings into link table.
INSERT INTO "EspAccountProviderLink" (
  "id",
  "accountKey",
  "provider",
  "locationId",
  "locationName",
  "linkedAt",
  "updatedAt"
)
SELECT
  'eapl_' || md5(coalesce("accountKey", '') || ':' || coalesce("provider", '')),
  "accountKey",
  "provider",
  "locationId",
  "locationName",
  "installedAt",
  COALESCE("updatedAt", CURRENT_TIMESTAMP)
FROM "EspOAuthConnection"
WHERE "locationId" IS NOT NULL
ON CONFLICT ("accountKey", "provider") DO UPDATE SET
  "locationId" = EXCLUDED."locationId",
  "locationName" = EXCLUDED."locationName",
  "updatedAt" = EXCLUDED."updatedAt";
