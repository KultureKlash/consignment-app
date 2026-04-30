/**
 * Seeds a few real-looking unpriced listings into the dev DB so we can test
 * the new "Set price later" flow end-to-end.
 *
 * Usage:  npx tsx scripts/seed-unpriced.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const SEED_DATA = [
  // Yaroslav (consignor-owned) — appears multiple times in find-unpriced output
  {
    consignorEmail: "yarobilo0809@gmail.com",
    products: [
      {
        title: "Fear of God Essentials Core Pullover Hoodie Tan",
        brand: "Fear of God",
        category: "Apparel > Hoodies",
        sku: "FOG-ESS-PH-TAN",
        sizes: ["XS"],
      },
      {
        title: "Jordan 3 Retro White Cement Reimagined",
        brand: "Jordan",
        category: "Footwear > Sneakers",
        sku: "JORDAN-3-WC-REIMAGINED",
        sizes: ["8.5"],
      },
      {
        title: "Air Jordan 4 Retro OG GS White Cement 2025",
        brand: "Jordan",
        category: "Footwear > Sneakers",
        sku: "AJ4-WC-GS-2025",
        sizes: ["6", "6"],  // qty: 2
      },
    ],
  },
  // Kulture Klash (store-owned) — admin will set prices via the admin Edit modal
  {
    consignorEmail: "turbo@shopkultureklash.com",
    products: [
      {
        title: "adidas Yeezy Boost 350 V2 Beluga Reflective",
        brand: "adidas",
        category: "Footwear > Sneakers",
        sku: "YZY-350-V2-BELUGA-REF",
        sizes: ["4", "4.5", "6.5"],
      },
      {
        title: "adidas Yeezy Slide Flax",
        brand: "adidas",
        category: "Footwear > Sandals",
        sku: "YZY-SLIDE-FLAX",
        sizes: ["7"],
      },
    ],
  },
];

async function main() {
  console.log("=== Seeding unpriced listings ===\n");

  for (const consignorBatch of SEED_DATA) {
    const consignor = await p.consignor.findUnique({
      where: { email: consignorBatch.consignorEmail },
    });
    if (!consignor) {
      console.log(`  ! Consignor not found: ${consignorBatch.consignorEmail}`);
      continue;
    }

    console.log(`Consignor: ${consignor.name}${consignor.storeOwned ? " (store-owned)" : ""}`);

    for (const productData of consignorBatch.products) {
      // Find or create product
      let product = await p.product.findFirst({
        where: { OR: [{ sku: productData.sku }, { title: productData.title }] },
      });
      if (!product) {
        product = await p.product.create({
          data: {
            title: productData.title,
            brand: productData.brand,
            category: productData.category,
            sku: productData.sku,
          },
        });
      }

      for (const size of productData.sizes) {
        // Find or create variant
        let variant = await p.variant.findFirst({
          where: { productId: product.id, size },
        });
        if (!variant) {
          variant = await p.variant.create({
            data: {
              productId: product.id,
              size,
              gtin: `SEED-${product.sku}-${size}-${Date.now()}`,
            },
          });
        }

        // Create the unpriced listing
        const listing = await p.listing.create({
          data: {
            consignorId: consignor.id,
            variantId: variant.id,
            price: null,
            status: "awaiting_price",
            listedAt: null,
          },
        });
        console.log(`  + ${productData.title} — size ${size} (${listing.id.slice(0, 8)})`);
      }
    }
    console.log();
  }

  // Summary
  const totalUnpriced = await p.listing.count({ where: { status: "awaiting_price" } });
  console.log(`Total AWAITING_PRICE listings in DB: ${totalUnpriced}`);

  await p.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
