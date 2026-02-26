-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "thumbnailKey" TEXT,
    "category" TEXT,
    "tags" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_accountKey_s3Key_key" ON "MediaAsset"("accountKey", "s3Key");

-- CreateIndex
CREATE INDEX "MediaAsset_accountKey_createdAt_idx" ON "MediaAsset"("accountKey", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_accountKey_category_idx" ON "MediaAsset"("accountKey", "category");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_accountKey_fkey" FOREIGN KEY ("accountKey") REFERENCES "Account"("key") ON DELETE CASCADE ON UPDATE CASCADE;
