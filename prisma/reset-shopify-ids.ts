/**
 * Dev utility: clears all Shopify IDs from Product and Variant tables.
 * Run with: npx tsx prisma/reset-shopify-ids.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.updateMany({
    data: { shopifyProductId: null },
  });

  const variants = await prisma.variant.updateMany({
    data: { shopifyVariantId: null, inventoryItemId: null },
  });

  console.log(`Reset ${products.count} product(s) and ${variants.count} variant(s).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
