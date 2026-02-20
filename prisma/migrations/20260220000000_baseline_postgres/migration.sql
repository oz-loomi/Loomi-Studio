-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'client',
    "accountKeys" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInvite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
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
    "accountRepId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEmailStats" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "firstDeliveredAt" TIMESTAMP(3),
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "openedCount" INTEGER NOT NULL DEFAULT 0,
    "clickedCount" INTEGER NOT NULL DEFAULT 0,
    "bouncedCount" INTEGER NOT NULL DEFAULT 0,
    "complainedCount" INTEGER NOT NULL DEFAULT 0,
    "unsubscribedCount" INTEGER NOT NULL DEFAULT 0,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignEmailStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspConnection" (
    "id" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "accountId" TEXT,
    "accountName" TEXT,
    "metadata" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspOAuthConnection" (
    "id" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "locationId" TEXT,
    "locationName" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspOAuthConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "content" TEXT NOT NULL,
    "preheader" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateTagAssignment" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "TemplateTagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountEmail" (
    "id" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "folderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audience" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "accountKey" TEXT,
    "createdByUserId" TEXT,
    "filters" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "providerMetadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoomiFlow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "accountKey" TEXT,
    "createdByUserId" TEXT,
    "sourceAudienceId" TEXT,
    "sourceFilter" TEXT,
    "metadata" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoomiFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "phone" TEXT,
    "fullName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "messageId" TEXT,
    "conversationId" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "subject" TEXT NOT NULL,
    "previewText" TEXT,
    "htmlContent" TEXT NOT NULL,
    "textContent" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'template-library',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "email" TEXT,
    "fullName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "messageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserInvite_tokenHash_key" ON "UserInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "UserInvite_userId_createdAt_idx" ON "UserInvite"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserInvite_expiresAt_idx" ON "UserInvite"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_key_key" ON "Account"("key");

-- CreateIndex
CREATE INDEX "Account_accountRepId_idx" ON "Account"("accountRepId");

-- CreateIndex
CREATE INDEX "CampaignEmailStats_provider_accountId_idx" ON "CampaignEmailStats"("provider", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignEmailStats_provider_accountId_campaignId_key" ON "CampaignEmailStats"("provider", "accountId", "campaignId");

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

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_accountRepId_fkey" FOREIGN KEY ("accountRepId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspConnection" ADD CONSTRAINT "EspConnection_accountKey_fkey" FOREIGN KEY ("accountKey") REFERENCES "Account"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspOAuthConnection" ADD CONSTRAINT "EspOAuthConnection_accountKey_fkey" FOREIGN KEY ("accountKey") REFERENCES "Account"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTagAssignment" ADD CONSTRAINT "TemplateTagAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTagAssignment" ADD CONSTRAINT "TemplateTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TemplateTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEmail" ADD CONSTRAINT "AccountEmail_accountKey_fkey" FOREIGN KEY ("accountKey") REFERENCES "Account"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEmail" ADD CONSTRAINT "AccountEmail_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEmail" ADD CONSTRAINT "AccountEmail_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "EmailFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audience" ADD CONSTRAINT "Audience_accountKey_fkey" FOREIGN KEY ("accountKey") REFERENCES "Account"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoomiFlow" ADD CONSTRAINT "LoomiFlow_accountKey_fkey" FOREIGN KEY ("accountKey") REFERENCES "Account"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsCampaignRecipient" ADD CONSTRAINT "SmsCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SmsCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaignRecipient" ADD CONSTRAINT "EmailCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

