-- Replace legacy Audience.ghlSmartListId with provider-neutral Audience.providerMetadata.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Audience" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "accountKey" TEXT,
  "createdByUserId" TEXT,
  "filters" TEXT NOT NULL,
  "icon" TEXT,
  "color" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "providerMetadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Audience_accountKey_fkey"
    FOREIGN KEY ("accountKey") REFERENCES "Account" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Audience" (
  "id",
  "name",
  "description",
  "accountKey",
  "createdByUserId",
  "filters",
  "icon",
  "color",
  "sortOrder",
  "providerMetadata",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "name",
  "description",
  "accountKey",
  "createdByUserId",
  "filters",
  "icon",
  "color",
  "sortOrder",
  CASE
    WHEN "ghlSmartListId" IS NULL OR TRIM("ghlSmartListId") = '' THEN NULL
    ELSE '{"ghl":{"smartListId":"' || REPLACE(REPLACE("ghlSmartListId", '\\', '\\\\'), '"', '\\"') || '"}}'
  END AS "providerMetadata",
  "createdAt",
  "updatedAt"
FROM "Audience";

DROP TABLE "Audience";
ALTER TABLE "new_Audience" RENAME TO "Audience";

CREATE UNIQUE INDEX "Audience_name_accountKey_key"
  ON "Audience"("name", "accountKey");
CREATE INDEX "Audience_accountKey_idx"
  ON "Audience"("accountKey");

PRAGMA foreign_keys=ON;
