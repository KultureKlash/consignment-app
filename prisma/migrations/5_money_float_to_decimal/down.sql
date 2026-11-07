-- Reverse of 5_money_float_to_decimal: numeric(10,2) back to double precision.
--
-- Prisma does not generate or run down migrations, so this is hand-written and
-- must be applied manually. Lossless: every value in these columns is a
-- 2-decimal amount, and a double represents those exactly up to 2^53 cents.
--
-- ROLLBACK PROCEDURE
--
--   1. Capture the current checksum so you can prove the reverse preserved it:
--        npx tsx scripts/money-checksum.ts --json > .money-decimal/pre-rollback.json
--
--   2. Apply this file. The DATABASE_URL must be the NON-pooled Neon connection,
--      because ALTER TABLE needs advisory locks a pooler will not hold:
--        psql "$DIRECT_DATABASE_URL" -f prisma/migrations/5_money_float_to_decimal/down.sql
--
--   3. Tell Prisma the migration is no longer applied, or `migrate deploy` will
--      consider the schema current and skip re-applying it:
--        npx prisma migrate resolve --rolled-back 5_money_float_to_decimal
--
--   4. Check out the application code from before this migration. The schema
--      alone is not enough: services compute in Prisma.Decimal and loaders call
--      .toNumber(), so Decimal-era code against double-precision columns will
--      throw on .toNumber() of a plain number. Roll both back together.
--
--   5. Verify nothing moved:
--        npx tsx scripts/money-checksum.ts --compare=.money-decimal/pre-rollback.json
--
-- Code and schema are a matched pair here. Rolling back one without the other
-- is the failure mode to avoid.

-- Listing
ALTER TABLE "Listing" ALTER COLUMN "price" TYPE double precision;
ALTER TABLE "Listing" ALTER COLUMN "cost"  TYPE double precision;

-- Order
ALTER TABLE "Order" ALTER COLUMN "total"            TYPE double precision;
ALTER TABLE "Order" ALTER COLUMN "shopifySubtotal"  TYPE double precision;
ALTER TABLE "Order" ALTER COLUMN "shopifyDiscounts" TYPE double precision;
ALTER TABLE "Order" ALTER COLUMN "shopifyTax"       TYPE double precision;
ALTER TABLE "Order" ALTER COLUMN "shopifyShipping"  TYPE double precision;
ALTER TABLE "Order" ALTER COLUMN "shopifyTotal"     TYPE double precision;

-- OrderItem
ALTER TABLE "OrderItem" ALTER COLUMN "price" TYPE double precision;

-- Transaction
ALTER TABLE "Transaction" ALTER COLUMN "salePrice"       TYPE double precision;
ALTER TABLE "Transaction" ALTER COLUMN "salePrice"       SET DEFAULT 0;
ALTER TABLE "Transaction" ALTER COLUMN "cost"            TYPE double precision;
ALTER TABLE "Transaction" ALTER COLUMN "cost"            SET DEFAULT 0;
ALTER TABLE "Transaction" ALTER COLUMN "grossAmount"     TYPE double precision;
ALTER TABLE "Transaction" ALTER COLUMN "grossAmount"     SET DEFAULT 0;
ALTER TABLE "Transaction" ALTER COLUMN "feeAmount"       TYPE double precision;
ALTER TABLE "Transaction" ALTER COLUMN "feeAmount"       SET DEFAULT 0;
ALTER TABLE "Transaction" ALTER COLUMN "consignorAmount" TYPE double precision;
ALTER TABLE "Transaction" ALTER COLUMN "consignorAmount" SET DEFAULT 0;
ALTER TABLE "Transaction" ALTER COLUMN "amount"          TYPE double precision;

-- Payout
ALTER TABLE "Payout" ALTER COLUMN "amount" TYPE double precision;
