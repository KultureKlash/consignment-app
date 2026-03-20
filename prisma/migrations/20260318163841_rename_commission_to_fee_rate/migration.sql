/*
  Warnings:

  - You are about to drop the column `commissionRate` on the `Consignor` table. All the data in the column will be lost.
  - You are about to drop the column `commissionAmount` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `commissionRate` on the `Transaction` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Consignor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "feeRate" REAL NOT NULL DEFAULT 0.15,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Consignor" ("createdAt", "email", "id", "name") SELECT "createdAt", "email", "id", "name" FROM "Consignor";
DROP TABLE "Consignor";
ALTER TABLE "new_Consignor" RENAME TO "Consignor";
CREATE UNIQUE INDEX "Consignor_email_key" ON "Consignor"("email");
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consignorId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "type" TEXT NOT NULL,
    "salePrice" REAL NOT NULL DEFAULT 0,
    "feeRate" REAL NOT NULL DEFAULT 0,
    "grossAmount" REAL NOT NULL DEFAULT 0,
    "feeAmount" REAL NOT NULL DEFAULT 0,
    "consignorAmount" REAL NOT NULL DEFAULT 0,
    "amount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_consignorId_fkey" FOREIGN KEY ("consignorId") REFERENCES "Consignor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("amount", "consignorId", "createdAt", "grossAmount", "id", "orderItemId", "salePrice", "type") SELECT "amount", "consignorId", "createdAt", "grossAmount", "id", "orderItemId", "salePrice", "type" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Listing_consignorId_status_createdAt_idx" ON "Listing"("consignorId", "status", "createdAt");
