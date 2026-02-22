-- Normalize CampaignEmailStats identity to provider/accountId/campaignId.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_CampaignEmailStats" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "firstDeliveredAt" DATETIME,
  "deliveredCount" INTEGER NOT NULL DEFAULT 0,
  "openedCount" INTEGER NOT NULL DEFAULT 0,
  "clickedCount" INTEGER NOT NULL DEFAULT 0,
  "bouncedCount" INTEGER NOT NULL DEFAULT 0,
  "complainedCount" INTEGER NOT NULL DEFAULT 0,
  "unsubscribedCount" INTEGER NOT NULL DEFAULT 0,
  "lastEventAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_CampaignEmailStats" (
  "id",
  "provider",
  "accountId",
  "campaignId",
  "firstDeliveredAt",
  "deliveredCount",
  "openedCount",
  "clickedCount",
  "bouncedCount",
  "complainedCount",
  "unsubscribedCount",
  "lastEventAt",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  COALESCE(
    (
      SELECT "provider"
      FROM "EspOAuthConnection" eoc
      WHERE eoc."locationId" = ces."locationId"
      ORDER BY eoc."updatedAt" DESC
      LIMIT 1
    ),
    (
      SELECT "provider"
      FROM "EspConnection" ec
      WHERE ec."accountId" = ces."locationId"
      ORDER BY ec."updatedAt" DESC
      LIMIT 1
    ),
    'ghl'
  ) AS "provider",
  ces."locationId" AS "accountId",
  "campaignId",
  "firstDeliveredAt",
  "deliveredCount",
  "openedCount",
  "clickedCount",
  "bouncedCount",
  "complainedCount",
  "unsubscribedCount",
  "lastEventAt",
  "createdAt",
  "updatedAt"
FROM "CampaignEmailStats" ces;

DROP TABLE "CampaignEmailStats";
ALTER TABLE "new_CampaignEmailStats" RENAME TO "CampaignEmailStats";

CREATE UNIQUE INDEX "CampaignEmailStats_provider_accountId_campaignId_key"
  ON "CampaignEmailStats"("provider", "accountId", "campaignId");
CREATE INDEX "CampaignEmailStats_provider_accountId_idx"
  ON "CampaignEmailStats"("provider", "accountId");

PRAGMA foreign_keys=ON;
