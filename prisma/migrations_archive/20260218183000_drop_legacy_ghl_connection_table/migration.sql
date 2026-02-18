-- Finalize OAuth storage unification:
-- 1) backfill any remaining legacy GhlConnection rows into EspOAuthConnection
-- 2) remove legacy GhlConnection table

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
  lower(hex(randomblob(16))) AS "id",
  g."accountKey",
  'ghl' AS "provider",
  g."locationId",
  g."locationName",
  g."accessToken",
  g."refreshToken",
  g."tokenExpiresAt",
  g."scopes",
  g."installedAt",
  g."updatedAt"
FROM "GhlConnection" g
WHERE NOT EXISTS (
  SELECT 1
  FROM "EspOAuthConnection" e
  WHERE e."accountKey" = g."accountKey"
    AND e."provider" = 'ghl'
);

DROP TABLE IF EXISTS "GhlConnection";
