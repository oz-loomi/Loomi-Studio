-- Per-ad pacer "today" and "end" dates for the redesigned Spend Pacing tab.
-- These are independent of the Ad Planner flight dates so a user can scope
-- the pacing math to any window they're inspecting.
ALTER TABLE "MetaAdsPacerAd" ADD COLUMN "pacerTodayDate" TEXT;
ALTER TABLE "MetaAdsPacerAd" ADD COLUMN "pacerEndDate" TEXT;

-- Drop the "New Ad" column default so empty names are honored at the
-- database level. Existing rows are left as-is; the application now renders
-- a placeholder for empty names rather than pre-filling the input.
ALTER TABLE "MetaAdsPacerAd" ALTER COLUMN "name" SET DEFAULT '';
