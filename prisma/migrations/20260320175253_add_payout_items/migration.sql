-- CreateTable
CREATE TABLE "PayoutItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payoutId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    CONSTRAINT "PayoutItem_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayoutItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PayoutItem_payoutId_transactionId_key" ON "PayoutItem"("payoutId", "transactionId");
