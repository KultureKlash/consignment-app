import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Helper: random date within last N days
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}
function randomDaysAgo(min: number, max: number): Date {
  return daysAgo(min + Math.floor(Math.random() * (max - min)));
}
function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  console.log("Seeding comprehensive test data...\n");

  // ── Consignors ──────────────────────────────────────────────
  const consignorData = [
    { name: "Alice Johnson", email: "alice@test.com", feeRate: 0.15 },
    { name: "Bob Smith", email: "bob@test.com", feeRate: 0.20 },
    { name: "Carlos Rivera", email: "carlos@test.com", feeRate: 0.10 },
    { name: "Diana Chen", email: "diana@test.com", feeRate: 0.15 },
    { name: "Emily Taylor", email: "emily@test.com", feeRate: 0.20 },
    { name: "Frank Morales", email: "frank@test.com", feeRate: 0.10 },
    // Shop consignors (100% fee = marketplace keeps everything, no payouts generated)
    { name: "Kulture Klash", email: "shop-footwear@kultureklash.com", feeRate: 1.0 },
    { name: "Kulture Klothing", email: "shop-clothing@kultureklothing.com", feeRate: 1.0 },
  ];

  const consignors = [];
  for (const c of consignorData) {
    const consignor = await prisma.consignor.upsert({
      where: { email: c.email },
      update: {},
      create: c,
    });
    consignors.push(consignor);
  }
  console.log(`  ✓ ${consignors.length} consignors`);

  // ── Products & Variants ─────────────────────────────────────
  const productSpecs = [
    // Footwear > Sneakers
    { title: "Nike Dunk Low Panda", brand: "Nike", category: "Footwear > Sneakers", sku: "DD1391-100", sizes: ["8", "9", "10", "11"] },
    { title: "Jordan 1 Retro High OG Chicago", brand: "Jordan", category: "Footwear > Sneakers", sku: "DZ5485-612", sizes: ["8", "9", "10", "11", "12"] },
    { title: "Adidas Yeezy Boost 350 V2 Zebra", brand: "Adidas", category: "Footwear > Sneakers", sku: "CP9654", sizes: ["8", "9", "10", "11"] },
    { title: "New Balance 550 White Green", brand: "New Balance", category: "Footwear > Sneakers", sku: "BB550WT1", sizes: ["8", "9", "10", "11"] },
    { title: "Nike Air Force 1 Low White", brand: "Nike", category: "Footwear > Sneakers", sku: "CW2288-111", sizes: ["7", "8", "9", "10", "11", "12"] },
    { title: "Adidas Campus 00s Dark Green", brand: "Adidas", category: "Footwear > Sneakers", sku: "H03472", sizes: ["8", "9", "10"] },
    // Footwear > Boots
    { title: "Timberland 6-Inch Premium Boot Wheat", brand: "Timberland", category: "Footwear > Boots", sku: "TB010061", sizes: ["9", "10", "11"] },
    { title: "UGG Classic Short Boot Chestnut", brand: "UGG", category: "Footwear > Boots", sku: "1016223", sizes: ["7", "8", "9"] },
    // Apparel
    { title: "Supreme Box Logo Hoodie Black", brand: "Supreme", category: "Apparel > Hoodies", sku: null, sizes: ["S", "M", "L", "XL"] },
    { title: "Fear of God Essentials Tee Cream", brand: "Fear of God", category: "Apparel > T-Shirts", sku: null, sizes: ["S", "M", "L", "XL"] },
    { title: "Nike Tech Fleece Joggers Black", brand: "Nike", category: "Apparel > Jogger Shorts", sku: null, sizes: ["S", "M", "L"] },
    { title: "Stussy Basic Crew Sweatshirt Grey", brand: "Stussy", category: "Apparel > Sweatshirts", sku: null, sizes: ["M", "L", "XL"] },
    // Accessories
    { title: "Louis Vuitton Keepall 55 Monogram", brand: "Louis Vuitton", category: "Accessories > Bags", sku: null, sizes: ["One Size"] },
    { title: "Casio G-Shock DW5600E", brand: "Casio", category: "Accessories > Watches", sku: null, sizes: ["One Size"] },
    // Headwear
    { title: "New Era Yankees Fitted 59FIFTY Navy", brand: "New Era", category: "Headwear > Fitted Hats", sku: null, sizes: ["7 1/4", "7 3/8", "7 1/2"] },
  ];

  // Price ranges per product (base prices, consignors will list around these)
  const basePrices: Record<string, number> = {
    "DD1391-100": 130,   // Dunk Panda
    "DZ5485-612": 280,   // Jordan 1 Chicago
    "CP9654": 250,       // Yeezy Zebra
    "BB550WT1": 120,     // NB 550
    "CW2288-111": 100,   // AF1 White
    "H03472": 110,       // Campus
    "TB010061": 200,     // Timberland
    "1016223": 170,      // UGG
  };
  const apparelPrices: Record<string, number> = {
    "Supreme Box Logo Hoodie Black": 450,
    "Fear of God Essentials Tee Cream": 50,
    "Nike Tech Fleece Joggers Black": 110,
    "Stussy Basic Crew Sweatshirt Grey": 85,
    "Louis Vuitton Keepall 55 Monogram": 1800,
    "Casio G-Shock DW5600E": 55,
    "New Era Yankees Fitted 59FIFTY Navy": 45,
  };

  type VariantRecord = { id: string; productId: string; size: string; productTitle: string; productStyleId: string | null };
  const allVariants: VariantRecord[] = [];
  let barcodeCounter = 1000;

  for (const spec of productSpecs) {
    let product;
    if (spec.sku) {
      product = await prisma.product.upsert({
        where: { sku: spec.sku },
        update: {},
        create: {
          title: spec.title,
          brand: spec.brand,
          category: spec.category,
          sku: spec.sku,
        },
      });
    } else {
      // No sku — find by title or create
      const existing = await prisma.product.findFirst({ where: { title: spec.title } });
      product = existing ?? await prisma.product.create({
        data: {
          title: spec.title,
          brand: spec.brand,
          category: spec.category,
        },
      });
    }

    for (const size of spec.sizes) {
      // Generate a GTIN for footwear, barcode for others
      const gtin = spec.sku
        ? `${spec.sku}-${size}-${String(barcodeCounter++).padStart(4, "0")}`
        : null;

      const variant = await prisma.variant.upsert({
        where: { productId_size: { productId: product.id, size } },
        update: {},
        create: {
          productId: product.id,
          size,
          gtin,
        },
      });
      allVariants.push({ id: variant.id, productId: product.id, size, productTitle: spec.title, productStyleId: spec.sku });
    }
  }
  console.log(`  ✓ ${productSpecs.length} products, ${allVariants.length} variants`);

  // ── Listings ────────────────────────────────────────────────
  // Generate ~120 listings across products and consignors
  type ListingRecord = { id: string; consignorId: string; variantId: string; price: number; status: string; createdAt: Date };
  const allListings: ListingRecord[] = [];

  for (const variant of allVariants) {
    const basePrice = variant.productStyleId
      ? basePrices[variant.productStyleId] ?? 150
      : apparelPrices[variant.productTitle] ?? 100;

    // 2-4 listings per variant from different consignors
    const listingCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < listingCount; i++) {
      const consignor = randomItem(consignors);
      // Price varies ±20% around base
      const priceVariation = basePrice * (0.9 + Math.random() * 0.3);
      const price = Math.round(priceVariation);
      const createdAt = randomDaysAgo(1, 30);

      const listing = await prisma.listing.create({
        data: {
          consignorId: consignor.id,
          variantId: variant.id,
          price,
          status: "active",
          listedAt: createdAt,
          createdAt,
        },
      });
      allListings.push({ id: listing.id, consignorId: consignor.id, variantId: variant.id, price, status: "active", createdAt });
    }
  }
  console.log(`  ✓ ${allListings.length} listings created (all active initially)`);

  // ── Mark some listings as sold/cancelled/pending_sale ───────
  // Shuffle listings and pick some to change status
  const shuffled = [...allListings].sort(() => Math.random() - 0.5);
  const toSell = shuffled.slice(0, 20);          // ~20 sold
  const toCancel = shuffled.slice(20, 30);        // ~10 cancelled
  const toPending = shuffled.slice(30, 38);       // ~8 pending_sale

  for (const l of toCancel) {
    await prisma.listing.update({
      where: { id: l.id },
      data: { status: "cancelled", withdrawnAt: new Date() },
    });
    l.status = "cancelled";
  }
  console.log(`  ✓ ${toCancel.length} listings cancelled`);

  for (const l of toPending) {
    await prisma.listing.update({
      where: { id: l.id },
      data: { status: "pending_sale" },
    });
    l.status = "pending_sale";
  }
  console.log(`  ✓ ${toPending.length} listings marked pending_sale`);

  // ── Orders & Sold Listings ─────────────────────────────────
  // Create 6 orders from the "toSell" listings
  const ordersToCreate = [
    { listings: toSell.slice(0, 4), paymentStatus: "paid" },
    { listings: toSell.slice(4, 7), paymentStatus: "paid" },
    { listings: toSell.slice(7, 10), paymentStatus: "paid" },
    { listings: toSell.slice(10, 13), paymentStatus: "paid" },
    { listings: toSell.slice(13, 16), paymentStatus: "pending" },
    { listings: toSell.slice(16, 20), paymentStatus: "pending" },
  ];

  let orderNum = 1;
  for (const orderSpec of ordersToCreate) {
    if (orderSpec.listings.length === 0) continue;

    const total = orderSpec.listings.reduce((sum, l) => sum + l.price, 0);
    const order = await prisma.order.create({
      data: {
        shopifyId: `gid://shopify/Order/seed-${String(orderNum).padStart(4, "0")}`,
        orderNumber: `#KK${1000 + orderNum}`,
        total,
        status: "open",
        paymentStatus: orderSpec.paymentStatus,
        createdAt: randomDaysAgo(0, 14),
      },
    });

    for (const listing of orderSpec.listings) {
      // Mark listing as sold
      await prisma.listing.update({
        where: { id: listing.id },
        data: { status: "sold", soldAt: order.createdAt },
      });
      listing.status = "sold";

      // Create OrderItem
      const orderItem = await prisma.orderItem.create({
        data: {
          orderId: order.id,
          listingId: listing.id,
          price: listing.price,
          status: "sold",
        },
      });

      // Create Transaction for paid orders
      if (orderSpec.paymentStatus === "paid") {
        const consignor = consignors.find((c) => c.id === listing.consignorId)!;
        const grossAmount = listing.price;
        const feeAmount = Math.round(grossAmount * consignor.feeRate * 100) / 100;
        const consignorAmount = Math.round((grossAmount - feeAmount) * 100) / 100;

        await prisma.transaction.create({
          data: {
            consignorId: consignor.id,
            orderItemId: orderItem.id,
            type: "sale",
            salePrice: listing.price,
            feeRate: consignor.feeRate,
            grossAmount,
            feeAmount,
            consignorAmount,
            amount: consignorAmount,
            createdAt: order.createdAt,
          },
        });
      }
    }
    orderNum++;
  }
  console.log(`  ✓ ${ordersToCreate.length} orders with order items and transactions`);

  // ── Summary ─────────────────────────────────────────────────
  const counts = {
    active: allListings.filter((l) => l.status === "active").length,
    sold: allListings.filter((l) => l.status === "sold").length,
    cancelled: allListings.filter((l) => l.status === "cancelled").length,
    pending_sale: allListings.filter((l) => l.status === "pending_sale").length,
  };

  console.log("\n=== SEED COMPLETE ===");
  console.log(`  Consignors: ${consignors.length}`);
  console.log(`  Products:   ${productSpecs.length}`);
  console.log(`  Variants:   ${allVariants.length}`);
  console.log(`  Listings:   ${allListings.length} (${counts.active} active, ${counts.sold} sold, ${counts.pending_sale} pending, ${counts.cancelled} cancelled)`);
  console.log(`  Orders:     ${ordersToCreate.length}`);
  console.log("\nNext step: run 'npx tsx scripts/rebuild-shopify-state.ts' to sync to Shopify\n");
}

main().catch(console.error).finally(() => prisma.$disconnect());
