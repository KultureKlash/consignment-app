-- Convert every money column from double precision to numeric(10,2).
--
-- WHY
-- Money was stored as Float. Individual rows happened to be clean, but summing
-- them was not: SUM(Listing.price) returned 883297.779999997 when the true total
-- is 883297.78, and Transaction.consignorAmount summed to 82820.29999999999
-- instead of 82820.30. getConsignorBalance() is built on exactly those sums, and
-- createPayout() compares one against zero.
--
-- SAFETY
-- Verified on Neon before running, with scripts/money-checksum.ts:
--   0 rows across all 16 columns would change value when cast to numeric(10,2)
--   0 values anywhere near the 1e8 ceiling of numeric(10,2)
-- So this cast is value-preserving per row. Re-run that script before applying
-- this to any other database; its PRE-FLIGHT GATE must read PASS.
--
-- The checksum that must match across this migration is
--   ROUND(SUM(col)::numeric, 2) before  ==  SUM(col) after
-- not raw SUM before == SUM after. See the script header for why.
--
-- NOT CONVERTED
-- Consignor.feeRate and Transaction.feeRate stay double precision. They are
-- rates, not amounts: no currency, no 2-decimal meaning, never summed or paid
-- out. calculateFee multiplies integer cents by the rate, which keeps rounding
-- in one place.
--
-- REVERSING
-- See down.sql beside this file. numeric -> double precision is lossless for
-- values that originated as 2-decimal amounts, so the reverse is safe.

-- Listing
ALTER TABLE "Listing" ALTER COLUMN "price" TYPE numeric(10,2);
ALTER TABLE "Listing" ALTER COLUMN "cost"  TYPE numeric(10,2);

-- Order
ALTER TABLE "Order" ALTER COLUMN "total"            TYPE numeric(10,2);
ALTER TABLE "Order" ALTER COLUMN "shopifySubtotal"  TYPE numeric(10,2);
ALTER TABLE "Order" ALTER COLUMN "shopifyDiscounts" TYPE numeric(10,2);
ALTER TABLE "Order" ALTER COLUMN "shopifyTax"       TYPE numeric(10,2);
ALTER TABLE "Order" ALTER COLUMN "shopifyShipping"  TYPE numeric(10,2);
ALTER TABLE "Order" ALTER COLUMN "shopifyTotal"     TYPE numeric(10,2);

-- OrderItem
ALTER TABLE "OrderItem" ALTER COLUMN "price" TYPE numeric(10,2);

-- Transaction. Defaults are re-stated because altering the type drops the old
-- double-precision default expression.
ALTER TABLE "Transaction" ALTER COLUMN "salePrice"       TYPE numeric(10,2);
ALTER TABLE "Transaction" ALTER COLUMN "salePrice"       SET DEFAULT 0;
ALTER TABLE "Transaction" ALTER COLUMN "cost"            TYPE numeric(10,2);
ALTER TABLE "Transaction" ALTER COLUMN "cost"            SET DEFAULT 0;
ALTER TABLE "Transaction" ALTER COLUMN "grossAmount"     TYPE numeric(10,2);
ALTER TABLE "Transaction" ALTER COLUMN "grossAmount"     SET DEFAULT 0;
ALTER TABLE "Transaction" ALTER COLUMN "feeAmount"       TYPE numeric(10,2);
ALTER TABLE "Transaction" ALTER COLUMN "feeAmount"       SET DEFAULT 0;
ALTER TABLE "Transaction" ALTER COLUMN "consignorAmount" TYPE numeric(10,2);
ALTER TABLE "Transaction" ALTER COLUMN "consignorAmount" SET DEFAULT 0;
ALTER TABLE "Transaction" ALTER COLUMN "amount"          TYPE numeric(10,2);

-- Payout
ALTER TABLE "Payout" ALTER COLUMN "amount" TYPE numeric(10,2);
