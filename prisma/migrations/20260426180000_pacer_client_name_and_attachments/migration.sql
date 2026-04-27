-- Client name on the ad
ALTER TABLE "MetaAdsPacerAd" ADD COLUMN "clientName" TEXT;

-- Attachments on activity log entries
ALTER TABLE "MetaAdsPacerActivityLog" ADD COLUMN "attachmentKey"      TEXT;
ALTER TABLE "MetaAdsPacerActivityLog" ADD COLUMN "attachmentFilename" TEXT;
ALTER TABLE "MetaAdsPacerActivityLog" ADD COLUMN "attachmentMimeType" TEXT;
ALTER TABLE "MetaAdsPacerActivityLog" ADD COLUMN "attachmentSize"     INTEGER;
