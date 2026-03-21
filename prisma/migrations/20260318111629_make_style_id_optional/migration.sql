-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "styleId" TEXT,
    "description" TEXT,
    "shopifyProductId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Product" ("brand", "category", "createdAt", "description", "id", "shopifyProductId", "styleId", "title") SELECT "brand", "category", "createdAt", "description", "id", "shopifyProductId", "styleId", "title" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_styleId_key" ON "Product"("styleId");
CREATE UNIQUE INDEX "Product_shopifyProductId_key" ON "Product"("shopifyProductId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
