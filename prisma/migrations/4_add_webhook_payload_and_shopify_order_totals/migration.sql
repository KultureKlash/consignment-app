-- AlterTable: WebhookEvent — keep the raw Shopify payload.
-- Previously only "event X, done/failed" was stored and the order data Shopify
-- sent was discarded. Keeping it makes a corrupted order replayable from source
-- and lets the reconciler read Shopify's own line amounts and discount
-- allocations without an Admin API call per order.
--
-- NOTE: contains customer PII. Prune on the same schedule as the row itself.
ALTER TABLE "WebhookEvent" ADD COLUMN "rawPayload" JSONB;

-- AlterTable: Order — record what Shopify charged, separately from what we owe.
-- "total" meant two different things depending on which code path created the
-- row: the live webhook path summed local listing prices, while seed-import.ts
-- wrote Shopify's grand total including tax and shipping. Any report summing the
-- column mixed units. "total" is now the listing-price sum everywhere, and
-- Shopify's figures live in these columns.
--
-- Bookkeeping only. None of these feed a consignor credit: consignors are paid on
-- their listing price and the store absorbs discounts (see CLAUDE.md).
ALTER TABLE "Order" ADD COLUMN "shopifySubtotal" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "shopifyDiscounts" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "shopifyTax" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "shopifyShipping" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "shopifyTotal" DOUBLE PRECISION;
