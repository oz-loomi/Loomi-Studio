-- Provider-agnostic OAuth connection storage (initially backfilled from GHL OAuth).
CREATE TABLE "EspOAuthConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "locationId" TEXT,
    "locationName" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" DATETIME NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EspOAuthConnection_accountKey_fkey"
      FOREIGN KEY ("accountKey") REFERENCES "Account" ("key")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EspOAuthConnection_accountKey_provider_key"
  ON "EspOAuthConnection"("accountKey", "provider");
CREATE INDEX "EspOAuthConnection_provider_idx"
  ON "EspOAuthConnection"("provider");
CREATE INDEX "EspOAuthConnection_accountKey_idx"
  ON "EspOAuthConnection"("accountKey");

-- Backfill existing GHL OAuth rows into the unified OAuth table.
INSERT INTO "EspOAuthConnection" (
  "id",
  "accountKey",
  "provider",
  "locationId",
  "locationName",
  "accessToken",
  "refreshToken",
  "tokenExpiresAt",
  "scopes",
  "installedAt",
  "updatedAt"
)
SELECT
  "id",
  "accountKey",
  'ghl' AS "provider",
  "locationId",
  "locationName",
  "accessToken",
  "refreshToken",
  "tokenExpiresAt",
  "scopes",
  "installedAt",
  "updatedAt"
FROM "GhlConnection"
WHERE NOT EXISTS (
  SELECT 1
  FROM "EspOAuthConnection" e
  WHERE e."accountKey" = "GhlConnection"."accountKey"
    AND e."provider" = 'ghl'
);
