-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'client',
    "clientKeys" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "dealer" TEXT NOT NULL,
    "category" TEXT,
    "oem" TEXT,
    "oems" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "salesPhone" TEXT,
    "servicePhone" TEXT,
    "partsPhone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "website" TEXT,
    "timezone" TEXT,
    "logos" TEXT,
    "branding" TEXT,
    "customValues" TEXT,
    "espProvider" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CampaignEmailStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "locationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "firstDeliveredAt" DATETIME,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "openedCount" INTEGER NOT NULL DEFAULT 0,
    "clickedCount" INTEGER NOT NULL DEFAULT 0,
    "bouncedCount" INTEGER NOT NULL DEFAULT 0,
    "complainedCount" INTEGER NOT NULL DEFAULT 0,
    "unsubscribedCount" INTEGER NOT NULL DEFAULT 0,
    "lastEventAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EspConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "accountId" TEXT,
    "accountName" TEXT,
    "metadata" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EspConnection_accountKey_fkey" FOREIGN KEY ("accountKey") REFERENCES "Account" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EspOAuthConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "locationId" TEXT,
    "locationName" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" DATETIME NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EspOAuthConnection_accountKey_fkey" FOREIGN KEY ("accountKey") REFERENCES "Account" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "content" TEXT NOT NULL,
    "preheader" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TemplateTagAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "TemplateTagAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TemplateTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TemplateTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountKey" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "folderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountEmail_accountKey_fkey" FOREIGN KEY ("accountKey") REFERENCES "Account" ("key") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountEmail_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountEmail_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "EmailFolder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailFolder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "accountKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Audience" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "accountKey" TEXT,
    "createdByUserId" TEXT,
    "filters" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "ghlSmartListId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Audience_accountKey_fkey" FOREIGN KEY ("accountKey") REFERENCES "Account" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoomiFlow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "accountKey" TEXT,
    "createdByUserId" TEXT,
    "sourceAudienceId" TEXT,
    "sourceFilter" TEXT,
    "metadata" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LoomiFlow_accountKey_fkey" FOREIGN KEY ("accountKey") REFERENCES "Account" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmsCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "scheduledFor" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdByUserId" TEXT,
    "createdByRole" TEXT,
    "sourceAudienceId" TEXT,
    "sourceFilter" TEXT,
    "accountKeys" TEXT NOT NULL DEFAULT '[]',
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SmsCampaignRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "phone" TEXT,
    "fullName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "messageId" TEXT,
    "conversationId" TEXT,
    "sentAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SmsCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SmsCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "subject" TEXT NOT NULL,
    "previewText" TEXT,
    "htmlContent" TEXT NOT NULL,
    "textContent" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'template-library',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "scheduledFor" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdByUserId" TEXT,
    "createdByRole" TEXT,
    "sourceAudienceId" TEXT,
    "sourceFilter" TEXT,
    "accountKeys" TEXT NOT NULL DEFAULT '[]',
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmailCampaignRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "email" TEXT,
    "fullName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "messageId" TEXT,
    "sentAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_key_key" ON "Account"("key");

-- CreateIndex
CREATE INDEX "CampaignEmailStats_locationId_idx" ON "CampaignEmailStats"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignEmailStats_locationId_campaignId_key" ON "CampaignEmailStats"("locationId", "campaignId");

-- CreateIndex
CREATE INDEX "EspConnection_provider_idx" ON "EspConnection"("provider");

-- CreateIndex
CREATE INDEX "EspConnection_accountKey_idx" ON "EspConnection"("accountKey");

-- CreateIndex
CREATE UNIQUE INDEX "EspConnection_accountKey_provider_key" ON "EspConnection"("accountKey", "provider");

-- CreateIndex
CREATE INDEX "EspOAuthConnection_provider_idx" ON "EspOAuthConnection"("provider");

-- CreateIndex
CREATE INDEX "EspOAuthConnection_accountKey_idx" ON "EspOAuthConnection"("accountKey");

-- CreateIndex
CREATE UNIQUE INDEX "EspOAuthConnection_accountKey_provider_key" ON "EspOAuthConnection"("accountKey", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Template_slug_key" ON "Template"("slug");

-- CreateIndex
CREATE INDEX "TemplateVersion_templateId_idx" ON "TemplateVersion"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateTag_name_key" ON "TemplateTag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateTagAssignment_templateId_tagId_key" ON "TemplateTagAssignment"("templateId", "tagId");

-- CreateIndex
CREATE INDEX "AccountEmail_accountKey_idx" ON "AccountEmail"("accountKey");

-- CreateIndex
CREATE INDEX "AccountEmail_templateId_idx" ON "AccountEmail"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailFolder_name_accountKey_key" ON "EmailFolder"("name", "accountKey");

-- CreateIndex
CREATE INDEX "Audience_accountKey_idx" ON "Audience"("accountKey");

-- CreateIndex
CREATE UNIQUE INDEX "Audience_name_accountKey_key" ON "Audience"("name", "accountKey");

-- CreateIndex
CREATE INDEX "LoomiFlow_accountKey_idx" ON "LoomiFlow"("accountKey");

-- CreateIndex
CREATE INDEX "LoomiFlow_status_idx" ON "LoomiFlow"("status");

-- CreateIndex
CREATE INDEX "LoomiFlow_createdAt_idx" ON "LoomiFlow"("createdAt");

-- CreateIndex
CREATE INDEX "SmsCampaign_status_scheduledFor_idx" ON "SmsCampaign"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "SmsCampaign_createdAt_idx" ON "SmsCampaign"("createdAt");

-- CreateIndex
CREATE INDEX "SmsCampaignRecipient_campaignId_status_idx" ON "SmsCampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "SmsCampaignRecipient_accountKey_status_idx" ON "SmsCampaignRecipient"("accountKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SmsCampaignRecipient_campaignId_contactId_accountKey_key" ON "SmsCampaignRecipient"("campaignId", "contactId", "accountKey");

-- CreateIndex
CREATE INDEX "EmailCampaign_status_scheduledFor_idx" ON "EmailCampaign"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "EmailCampaign_createdAt_idx" ON "EmailCampaign"("createdAt");

-- CreateIndex
CREATE INDEX "EmailCampaignRecipient_campaignId_status_idx" ON "EmailCampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "EmailCampaignRecipient_accountKey_status_idx" ON "EmailCampaignRecipient"("accountKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailCampaignRecipient_campaignId_contactId_accountKey_key" ON "EmailCampaignRecipient"("campaignId", "contactId", "accountKey");

