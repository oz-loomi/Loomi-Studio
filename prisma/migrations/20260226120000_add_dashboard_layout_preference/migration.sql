-- CreateTable
CREATE TABLE "DashboardLayoutPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "orderJson" TEXT NOT NULL DEFAULT '[]',
    "hiddenJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardLayoutPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DashboardLayoutPreference_userId_role_mode_scopeKey_key" ON "DashboardLayoutPreference"("userId", "role", "mode", "scopeKey");

-- CreateIndex
CREATE INDEX "DashboardLayoutPreference_userId_updatedAt_idx" ON "DashboardLayoutPreference"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "DashboardLayoutPreference" ADD CONSTRAINT "DashboardLayoutPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
