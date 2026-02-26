-- Make accountKey nullable for admin-level S3 assets (Loomi media library)
ALTER TABLE "MediaAsset" ALTER COLUMN "accountKey" DROP NOT NULL;

-- Drop the old composite unique and replace with s3Key-only unique
-- (s3Key is globally unique since it contains a UUID)
DROP INDEX IF EXISTS "MediaAsset_accountKey_s3Key_key";
CREATE UNIQUE INDEX "MediaAsset_s3Key_key" ON "MediaAsset"("s3Key");

-- Drop and re-add FK to allow NULLs (optional relation)
ALTER TABLE "MediaAsset" DROP CONSTRAINT IF EXISTS "MediaAsset_accountKey_fkey";
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_accountKey_fkey"
  FOREIGN KEY ("accountKey") REFERENCES "Account"("key")
  ON DELETE CASCADE ON UPDATE CASCADE;
