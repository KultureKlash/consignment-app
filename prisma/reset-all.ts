/**
 * Dev utility: wipes all marketplace data (listings, variants, products)
 * and resets Shopify IDs. Keeps consignors and sessions intact.
 * Run with: npx tsx prisma/reset-all.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Delete in order to respect foreign keys
  const listings = await prisma.listing.deleteMany();
  const variants = await prisma.variant.deleteMany();
  const products = await prisma.product.deleteMany();

  console.log(
    `Deleted ${listings.count} listing(s), ${variants.count} variant(s), ${products.count} product(s).`
  );
  console.log("Consignors and sessions kept. Now delete products from Shopify Admin too.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
