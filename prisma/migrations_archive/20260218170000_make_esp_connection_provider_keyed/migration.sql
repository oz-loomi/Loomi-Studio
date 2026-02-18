-- Convert EspConnection from single-row-per-account to provider-keyed rows.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_EspConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "accountId" TEXT,
    "accountName" TEXT,
    "metadata" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EspConnection_accountKey_fkey"
      FOREIGN KEY ("accountKey") REFERENCES "Account" ("key")
      ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_EspConnection" (
  "id",
  "accountKey",
  "provider",
  "apiKey",
  "accountId",
  "accountName",
  "metadata",
  "installedAt",
  "updatedAt"
)
SELECT
  "id",
  "accountKey",
  "provider",
  "apiKey",
  "accountId",
  "accountName",
  "metadata",
  "installedAt",
  "updatedAt"
FROM "EspConnection";

DROP TABLE "EspConnection";
ALTER TABLE "new_EspConnection" RENAME TO "EspConnection";

CREATE UNIQUE INDEX "EspConnection_accountKey_provider_key"
  ON "EspConnection"("accountKey", "provider");
CREATE INDEX "EspConnection_provider_idx"
  ON "EspConnection"("provider");
CREATE INDEX "EspConnection_accountKey_idx"
  ON "EspConnection"("accountKey");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
