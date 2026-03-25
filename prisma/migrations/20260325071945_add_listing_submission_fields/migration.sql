-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "Listing" ADD COLUMN "rejectedAt" DATETIME;
ALTER TABLE "Listing" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "Listing" ADD COLUMN "submittedAt" DATETIME;
