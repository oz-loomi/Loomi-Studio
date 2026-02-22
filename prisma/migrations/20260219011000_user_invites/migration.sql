-- CreateTable
CREATE TABLE "UserInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserInvite_tokenHash_key" ON "UserInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "UserInvite_userId_createdAt_idx" ON "UserInvite"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserInvite_expiresAt_idx" ON "UserInvite"("expiresAt");
