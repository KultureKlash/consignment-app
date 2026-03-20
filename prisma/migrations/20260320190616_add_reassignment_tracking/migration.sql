-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "reassignedFromConsignorId" TEXT;
ALTER TABLE "Listing" ADD COLUMN "reassignedFromListingId" TEXT;

-- CreateTable
CREATE TABLE "ReassignmentLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalListingId" TEXT NOT NULL,
    "newListingId" TEXT NOT NULL,
    "originalConsignorId" TEXT NOT NULL,
    "newConsignorId" TEXT NOT NULL,
    "orderId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
