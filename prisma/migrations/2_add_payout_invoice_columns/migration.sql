-- AlterTable: Payout — add invoice metadata columns (base64 PDF + original filename)
-- These were added to the model when we built the consignor invoice upload feature
-- but never made it into the original 0_init migration.
ALTER TABLE "Payout" ADD COLUMN "invoiceData" TEXT;
ALTER TABLE "Payout" ADD COLUMN "invoiceFileName" TEXT;
