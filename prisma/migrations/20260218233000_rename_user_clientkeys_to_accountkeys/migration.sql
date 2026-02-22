-- Rename legacy User.clientKeys column to User.accountKeys.
ALTER TABLE "User" RENAME COLUMN "clientKeys" TO "accountKeys";
