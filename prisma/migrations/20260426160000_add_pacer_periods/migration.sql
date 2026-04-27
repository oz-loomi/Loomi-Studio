-- AlterTable: add period to MetaAdsPacerAd
ALTER TABLE "MetaAdsPacerAd" ADD COLUMN "period" TEXT NOT NULL DEFAULT '';

-- Backfill period from the legacy month tag (assume current year — operators can edit per-ad)
UPDATE "MetaAdsPacerAd"
SET "period" = CASE LOWER(TRIM("month"))
    WHEN 'january'   THEN '2026-01'
    WHEN 'february'  THEN '2026-02'
    WHEN 'march'     THEN '2026-03'
    WHEN 'april'     THEN '2026-04'
    WHEN 'may'       THEN '2026-05'
    WHEN 'june'      THEN '2026-06'
    WHEN 'july'      THEN '2026-07'
    WHEN 'august'    THEN '2026-08'
    WHEN 'september' THEN '2026-09'
    WHEN 'october'   THEN '2026-10'
    WHEN 'november'  THEN '2026-11'
    WHEN 'december'  THEN '2026-12'
    ELSE ''
  END
WHERE "period" = '';

CREATE INDEX "MetaAdsPacerAd_planId_period_position_idx" ON "MetaAdsPacerAd"("planId", "period", "position");

-- CreateTable: MetaAdsPacerPeriodBudget
CREATE TABLE "MetaAdsPacerPeriodBudget" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "baseBudgetGoal" TEXT,
    "addedBudgetGoal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdsPacerPeriodBudget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaAdsPacerPeriodBudget_planId_period_key" ON "MetaAdsPacerPeriodBudget"("planId", "period");
CREATE INDEX "MetaAdsPacerPeriodBudget_planId_period_idx" ON "MetaAdsPacerPeriodBudget"("planId", "period");

ALTER TABLE "MetaAdsPacerPeriodBudget" ADD CONSTRAINT "MetaAdsPacerPeriodBudget_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "MetaAdsPacerPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate any legacy plan-level budget goals to a current-month period budget (idempotent on plan id)
INSERT INTO "MetaAdsPacerPeriodBudget" ("id", "planId", "period", "baseBudgetGoal", "addedBudgetGoal", "createdAt", "updatedAt")
SELECT
  CONCAT('migr_', "id"),
  "id",
  '2026-04',
  "baseBudgetGoal",
  "addedBudgetGoal",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "MetaAdsPacerPlan"
WHERE "baseBudgetGoal" IS NOT NULL OR "addedBudgetGoal" IS NOT NULL
ON CONFLICT ("planId", "period") DO NOTHING;
