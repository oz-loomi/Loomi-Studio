-- AlterTable: add department to User
ALTER TABLE "User" ADD COLUMN "department" TEXT;

-- CreateTable: MetaAdsPacerPlan
CREATE TABLE "MetaAdsPacerPlan" (
    "id" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "baseBudgetGoal" TEXT,
    "addedBudgetGoal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdsPacerPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaAdsPacerPlan_accountKey_key" ON "MetaAdsPacerPlan"("accountKey");

ALTER TABLE "MetaAdsPacerPlan" ADD CONSTRAINT "MetaAdsPacerPlan_accountKey_fkey"
  FOREIGN KEY ("accountKey") REFERENCES "Account"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: MetaAdsPacerAd
CREATE TABLE "MetaAdsPacerAd" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL DEFAULT 'New Ad',
    "ownerUserId" TEXT,
    "designerUserId" TEXT,
    "accountRepUserId" TEXT,
    "month" TEXT,
    "actionNeeded" TEXT,
    "recurring" TEXT NOT NULL DEFAULT 'No',
    "coop" TEXT NOT NULL DEFAULT 'No',
    "budgetType" TEXT NOT NULL DEFAULT 'Daily',
    "budgetSource" TEXT NOT NULL DEFAULT 'base',
    "flightStart" TEXT,
    "flightEnd" TEXT,
    "liveDate" TEXT,
    "creativeDueDate" TEXT,
    "dateCompleted" TEXT,
    "adStatus" TEXT NOT NULL DEFAULT 'In Draft',
    "designStatus" TEXT NOT NULL DEFAULT 'Not Started',
    "internalApproval" TEXT NOT NULL DEFAULT 'Pending Approval',
    "clientApproval" TEXT NOT NULL DEFAULT 'Pending Approval',
    "allocation" TEXT,
    "pacerActual" TEXT,
    "pacerDailyBudget" TEXT,
    "creativeLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdsPacerAd_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MetaAdsPacerAd_planId_position_idx" ON "MetaAdsPacerAd"("planId", "position");
CREATE INDEX "MetaAdsPacerAd_adStatus_idx" ON "MetaAdsPacerAd"("adStatus");
CREATE INDEX "MetaAdsPacerAd_designerUserId_idx" ON "MetaAdsPacerAd"("designerUserId");
CREATE INDEX "MetaAdsPacerAd_ownerUserId_idx" ON "MetaAdsPacerAd"("ownerUserId");

ALTER TABLE "MetaAdsPacerAd" ADD CONSTRAINT "MetaAdsPacerAd_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "MetaAdsPacerPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAdsPacerAd" ADD CONSTRAINT "MetaAdsPacerAd_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MetaAdsPacerAd" ADD CONSTRAINT "MetaAdsPacerAd_designerUserId_fkey"
  FOREIGN KEY ("designerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MetaAdsPacerAd" ADD CONSTRAINT "MetaAdsPacerAd_accountRepUserId_fkey"
  FOREIGN KEY ("accountRepUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: MetaAdsPacerDesignNote
CREATE TABLE "MetaAdsPacerDesignNote" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaAdsPacerDesignNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MetaAdsPacerDesignNote_adId_createdAt_idx" ON "MetaAdsPacerDesignNote"("adId", "createdAt");

ALTER TABLE "MetaAdsPacerDesignNote" ADD CONSTRAINT "MetaAdsPacerDesignNote_adId_fkey"
  FOREIGN KEY ("adId") REFERENCES "MetaAdsPacerAd"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAdsPacerDesignNote" ADD CONSTRAINT "MetaAdsPacerDesignNote_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: MetaAdsPacerActivityLog
CREATE TABLE "MetaAdsPacerActivityLog" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaAdsPacerActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MetaAdsPacerActivityLog_adId_createdAt_idx" ON "MetaAdsPacerActivityLog"("adId", "createdAt");

ALTER TABLE "MetaAdsPacerActivityLog" ADD CONSTRAINT "MetaAdsPacerActivityLog_adId_fkey"
  FOREIGN KEY ("adId") REFERENCES "MetaAdsPacerAd"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaAdsPacerActivityLog" ADD CONSTRAINT "MetaAdsPacerActivityLog_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
