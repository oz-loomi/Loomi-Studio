-- Remove implicit GHL fallback at the DB layer.
-- Accounts must always set espProvider explicitly.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "dealer" TEXT NOT NULL,
    "category" TEXT,
    "oem" TEXT,
    "oems" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "salesPhone" TEXT,
    "servicePhone" TEXT,
    "partsPhone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "website" TEXT,
    "timezone" TEXT,
    "logos" TEXT,
    "branding" TEXT,
    "customValues" TEXT,
    "espProvider" TEXT NOT NULL,
    "ghlLocationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Account" (
  "id",
  "key",
  "dealer",
  "category",
  "oem",
  "oems",
  "email",
  "phone",
  "salesPhone",
  "servicePhone",
  "partsPhone",
  "address",
  "city",
  "state",
  "postalCode",
  "website",
  "timezone",
  "logos",
  "branding",
  "customValues",
  "espProvider",
  "ghlLocationId",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "key",
  "dealer",
  "category",
  "oem",
  "oems",
  "email",
  "phone",
  "salesPhone",
  "servicePhone",
  "partsPhone",
  "address",
  "city",
  "state",
  "postalCode",
  "website",
  "timezone",
  "logos",
  "branding",
  "customValues",
  "espProvider",
  "ghlLocationId",
  "createdAt",
  "updatedAt"
FROM "Account";

DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";

CREATE UNIQUE INDEX "Account_key_key" ON "Account"("key");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
