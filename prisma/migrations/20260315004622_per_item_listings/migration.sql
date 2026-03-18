/*
  Warnings:

  - You are about to drop the column `quantity` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `quantityRefunded` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `Transaction` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Listing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consignorId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" DATETIME,
    "authenticatedAt" DATETIME,
    "listedAt" DATETIME,
    "soldAt" DATETIME,
    "withdrawnAt" DATETIME,
    CONSTRAINT "Listing_consignorId_fkey" FOREIGN KEY ("consignorId") REFERENCES "Consignor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Listing_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Listing" ("consignorId", "createdAt", "id", "price", "status", "variantId") SELECT "consignorId", "createdAt", "id", "price", "status", "variantId" FROM "Listing";
DROP TABLE "Listing";
ALTER TABLE "new_Listing" RENAME TO "Listing";
CREATE INDEX "Listing_variantId_status_price_createdAt_idx" ON "Listing"("variantId", "status", "price", "createdAt");
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sold',
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("id", "listingId", "orderId", "price") SELECT "id", "listingId", "orderId", "price" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consignorId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "type" TEXT NOT NULL,
    "salePrice" REAL NOT NULL DEFAULT 0,
    "commissionRate" REAL NOT NULL DEFAULT 0,
    "grossAmount" REAL NOT NULL DEFAULT 0,
    "commissionAmount" REAL NOT NULL DEFAULT 0,
    "amount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_consignorId_fkey" FOREIGN KEY ("consignorId") REFERENCES "Consignor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("amount", "commissionAmount", "commissionRate", "consignorId", "createdAt", "grossAmount", "id", "orderItemId", "salePrice", "type") SELECT "amount", "commissionAmount", "commissionRate", "consignorId", "createdAt", "grossAmount", "id", "orderItemId", "salePrice", "type" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
