-- Replace boolean `refunded` with integer `quantityRefunded` on OrderItem
-- Convert: refunded=true → quantityRefunded=quantity, refunded=false → 0

ALTER TABLE "OrderItem" ADD COLUMN "quantityRefunded" INTEGER NOT NULL DEFAULT 0;

-- Migrate existing data: if refunded was true, set quantityRefunded = quantity
UPDATE "OrderItem" SET "quantityRefunded" = "quantity" WHERE "refunded" = 1;

-- Drop the old column
ALTER TABLE "OrderItem" DROP COLUMN "refunded";
