-- Add changelog feature post for GHL agency OAuth architecture rollout
INSERT INTO "ChangelogEntry" (
  "id",
  "title",
  "content",
  "type",
  "publishedAt",
  "createdBy",
  "createdAt",
  "updatedAt"
)
VALUES (
  'feature_ghl_agency_oauth_20260221',
  'GHL Agency OAuth + Bulk Location Linking',
  'Replaced per-location OAuth with an agency-token architecture for GoHighLevel. OAuth can now be authorized once at the agency level, locations are linked per account, location tokens are minted on demand, and required scope updates can be rolled out through one re-authorization. Added account-level agency linking UI and a bulk location-link assistant to accelerate migration.',
  'feature',
  CURRENT_TIMESTAMP,
  'Codex',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
