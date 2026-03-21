-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Variant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "gtin" TEXT,
    "shopifyVariantId" TEXT,
    "inventoryItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Variant" ("createdAt", "gtin", "id", "inventoryItemId", "productId", "shopifyVariantId", "size") SELECT "createdAt", NULLIF("gtin", ''), "id", "inventoryItemId", "productId", "shopifyVariantId", "size" FROM "Variant";
DROP TABLE "Variant";
ALTER TABLE "new_Variant" RENAME TO "Variant";
CREATE UNIQUE INDEX "Variant_gtin_key" ON "Variant"("gtin");
CREATE UNIQUE INDEX "Variant_shopifyVariantId_key" ON "Variant"("shopifyVariantId");
CREATE UNIQUE INDEX "Variant_productId_size_key" ON "Variant"("productId", "size");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
