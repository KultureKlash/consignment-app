-- AlterTable: Order — record Shopify line items that have no local Variant.
-- processOrder used to throw on the first unmapped line item, which rolled back
-- the whole order transaction: a cart mixing a consignment item with a gift card
-- or a product created outside this app produced no Order row at all, so the
-- consignment items were never marked sold and never credited. They are now
-- skipped and recorded here instead, and surfaced on the admin order detail page.
ALTER TABLE "Order" ADD COLUMN "unmappedLineItems" JSONB;
