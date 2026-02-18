-- Retire legacy private-token columns in favor of OAuth-only GHL connections.
ALTER TABLE "Account" DROP COLUMN "ghlApiToken";
ALTER TABLE "Account" DROP COLUMN "ghlConnectedAt";
