/*
  Warnings:

  - A unique constraint covering the columns `[shopifyId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - Made the column `styleId` on table `Product` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "brand" TEXT,
    "styleId" TEXT NOT NULL,
    "description" TEXT,
    "shopifyProductId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Product" ("brand", "createdAt", "description", "id", "styleId", "title") SELECT "brand", "createdAt", "description", "id", "styleId", "title" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_styleId_key" ON "Product"("styleId");
CREATE UNIQUE INDEX "Product_shopifyProductId_key" ON "Product"("shopifyProductId");
CREATE TABLE "new_Variant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "shopifyVariantId" TEXT,
    "inventoryItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Variant" ("id", "productId", "size") SELECT "id", "productId", "size" FROM "Variant";
DROP TABLE "Variant";
ALTER TABLE "new_Variant" RENAME TO "Variant";
CREATE UNIQUE INDEX "Variant_shopifyVariantId_key" ON "Variant"("shopifyVariantId");
CREATE UNIQUE INDEX "Variant_productId_size_key" ON "Variant"("productId", "size");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Listing_variantId_idx" ON "Listing"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_shopifyId_key" ON "Order"("shopifyId");
