-- AlterTable: add slug column (nullable first for backfill)
ALTER TABLE "Account" ADD COLUMN "slug" TEXT;

-- Backfill: generate kebab-case slugs from dealer name
UPDATE "Account"
SET "slug" = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      TRIM("dealer"),
      '[^a-zA-Z0-9]+', '-', 'g'
    ),
    '^-|-$', '', 'g'
  )
);

-- Handle duplicate slugs by appending city/state or a numeric suffix
DO $$
DECLARE
  dup RECORD;
  acct RECORD;
  counter INT;
  new_slug TEXT;
BEGIN
  -- Find slugs that appear more than once
  FOR dup IN
    SELECT slug FROM "Account" GROUP BY slug HAVING COUNT(*) > 1
  LOOP
    counter := 0;
    FOR acct IN
      SELECT id, slug, city, state FROM "Account" WHERE slug = dup.slug ORDER BY "createdAt"
    LOOP
      IF counter = 0 THEN
        -- First one keeps the original slug
        counter := counter + 1;
        CONTINUE;
      END IF;

      -- Try city suffix first
      IF acct.city IS NOT NULL AND acct.city != '' THEN
        new_slug := acct.slug || '-' || LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(acct.city), '[^a-zA-Z0-9]+', '-', 'g'), '^-|-$', '', 'g'));
      ELSIF acct.state IS NOT NULL AND acct.state != '' THEN
        new_slug := acct.slug || '-' || LOWER(TRIM(acct.state));
      ELSE
        new_slug := acct.slug || '-' || counter;
      END IF;

      UPDATE "Account" SET slug = new_slug WHERE id = acct.id;
      counter := counter + 1;
    END LOOP;
  END LOOP;
END $$;

-- Now make it required and unique
ALTER TABLE "Account" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Account_slug_key" ON "Account"("slug");
