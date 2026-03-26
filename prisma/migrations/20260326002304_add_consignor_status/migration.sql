-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "cost" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Consignor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "taxStatus" TEXT NOT NULL DEFAULT 'individual',
    "province" TEXT,
    "gstNumber" TEXT,
    "qstNumber" TEXT,
    "storeOwned" BOOLEAN NOT NULL DEFAULT false,
    "feeRate" REAL NOT NULL DEFAULT 0.15,
    "status" TEXT NOT NULL DEFAULT 'active',
    "suspensionReason" TEXT,
    "suspendedAt" DATETIME,
    "avatarColor" TEXT,
    "notificationPrefs" TEXT,
    "notificationsReadAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Consignor" ("createdAt", "email", "feeRate", "id", "name", "notificationsReadAt") SELECT "createdAt", "email", "feeRate", "id", "name", "notificationsReadAt" FROM "Consignor";
DROP TABLE "Consignor";
ALTER TABLE "new_Consignor" RENAME TO "Consignor";
CREATE UNIQUE INDEX "Consignor_email_key" ON "Consignor"("email");
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consignorId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "type" TEXT NOT NULL,
    "salePrice" REAL NOT NULL DEFAULT 0,
    "cost" REAL NOT NULL DEFAULT 0,
    "feeRate" REAL NOT NULL DEFAULT 0,
    "grossAmount" REAL NOT NULL DEFAULT 0,
    "feeAmount" REAL NOT NULL DEFAULT 0,
    "consignorAmount" REAL NOT NULL DEFAULT 0,
    "amount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_consignorId_fkey" FOREIGN KEY ("consignorId") REFERENCES "Consignor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("amount", "consignorAmount", "consignorId", "createdAt", "feeAmount", "feeRate", "grossAmount", "id", "orderItemId", "salePrice", "type") SELECT "amount", "consignorAmount", "consignorId", "createdAt", "feeAmount", "feeRate", "grossAmount", "id", "orderItemId", "salePrice", "type" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
