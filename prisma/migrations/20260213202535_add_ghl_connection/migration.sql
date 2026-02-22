-- CreateTable
CREATE TABLE "GhlConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientKey" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "locationName" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" DATETIME NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "GhlConnection_clientKey_key" ON "GhlConnection"("clientKey");
