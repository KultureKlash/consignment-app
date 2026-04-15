/**
 * Seed script: imports data from db-export.json into the local SQLite database.
 *
 * Usage:
 *   npx tsx prisma/seed-import.ts
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

interface ExportData {
  consignors: Array<{
    name: string;
    email: string;
    phone: string | null;
    taxStatus: string;
    province: string | null;
    feeRate: number;
    storeOwned: boolean;
    username?: string;
    gstNumber?: string | null;
    qstNumber?: string | null;
  }>;
  products: Array<{
    title: string;
    brand: string | null;
    category: string | null;
    sku: string | null;
    description: string | null;
    imageUrl: string | null;
  }>;
  variants: Array<{
    productTitle: string;
    size: string;
    gtin: string | null;
  }>;
  listings: Array<{
    consignorEmail: string;
    productTitle: string;
    size: string;
    price: number;
    cost: number | null;
    status: string;
    quantity?: number;
  }>;
  orders: Array<{
    shopifyOrderId: string;
    orderName: string;
    customerEmail: string;
    customerName: string;
    subtotalPrice: number;
    totalTax: number;
    totalDiscounts: number;
    totalPrice: number;
    financialStatus: string;
    fulfillmentStatus: string;
    createdAt: string;
  }>;
  orderItems: Array<{
    shopifyOrderId: string;
    productTitle: string;
    variantTitle: string | null;
    price: number;
    quantity: number;
    sku: string | null;
    vendor: string;
    fulfillmentStatus: string;
  }>;
  transactions: Array<{
    consignorEmail: string;
    consignorName: string;
    productTitle: string;
    shopifyOrderId: string;
    salePrice: number;
    consignorPayout: number;
    commissionAmount: number;
    isPaid: boolean;
    createdAt: string;
  }>;
}

async function main() {
  const filePath = path.resolve(__dirname, "../db-export.json");
  if (!fs.existsSync(filePath)) {
    console.error("db-export.json not found in project root");
    process.exit(1);
  }

  const data: ExportData = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  console.log(`Importing: ${data.consignors.length} consignors, ${data.products.length} products, ${data.variants.length} variants, ${data.listings.length} listings, ${data.orders.length} orders, ${data.orderItems.length} orderItems, ${data.transactions.length} transactions`);

  // ── 1. Consignors (upsert to handle duplicate emails) ──
  console.log("Seeding consignors...");
  const consignorMap = new Map<string, string>(); // email -> id
  for (const c of data.consignors) {
    const emailLower = c.email.toLowerCase();
    if (consignorMap.has(emailLower)) continue; // skip duplicate
    const created = await prisma.consignor.create({
      data: {
        name: c.name,
        email: emailLower,
        phone: c.phone,
        taxStatus: c.taxStatus || "individual",
        province: c.province,
        gstNumber: c.gstNumber ?? null,
        qstNumber: c.qstNumber ?? null,
        storeOwned: c.storeOwned || false,
        feeRate: c.feeRate ?? 0.15,
        status: "active",
      },
    });
    consignorMap.set(emailLower, created.id);
  }
  console.log(`  ✓ ${consignorMap.size} consignors`);

  // ── 2. Products (skip duplicate titles) ──
  console.log("Seeding products...");
  const productMap = new Map<string, string>(); // title -> id
  for (const p of data.products) {
    if (productMap.has(p.title)) continue; // skip duplicate title
    const created = await prisma.product.create({
      data: {
        title: p.title,
        brand: p.brand,
        category: p.category,
        sku: p.sku,
        description: p.description,
        imageUrl: p.imageUrl,
      },
    });
    productMap.set(p.title, created.id);
  }
  console.log(`  ✓ ${productMap.size} products`);

  // ── 3. Variants ──
  console.log("Seeding variants...");
  const variantMap = new Map<string, string>(); // "productTitle|size" -> id
  let variantSkipped = 0;
  for (const v of data.variants) {
    const productId = productMap.get(v.productTitle);
    if (!productId) {
      variantSkipped++;
      continue;
    }
    const key = `${v.productTitle}|${v.size}`;
    // Skip duplicates (same product+size)
    if (variantMap.has(key)) continue;
    try {
      const created = await prisma.variant.create({
        data: {
          productId,
          size: v.size,
          gtin: v.gtin,
        },
      });
      variantMap.set(key, created.id);
    } catch {
      // Unique constraint violation (duplicate gtin) — skip
      variantSkipped++;
    }
  }
  console.log(`  ✓ ${variantMap.size} variants (${variantSkipped} skipped)`);

  // ── 4. Listings ──
  console.log("Seeding listings...");
  let listingCount = 0;
  let listingSkipped = 0;
  const listingsByOrder = new Map<string, string[]>(); // for order item matching later

  for (const l of data.listings) {
    const consignorId = consignorMap.get(l.consignorEmail.toLowerCase());
    const variantKey = `${l.productTitle}|${l.size}`;
    const variantId = variantMap.get(variantKey);

    if (!consignorId || !variantId) {
      listingSkipped++;
      continue;
    }

    // Map old status to new status values
    let status = l.status;
    if (status === "available" || status === "live") status = "active";

    await prisma.listing.create({
      data: {
        consignorId,
        variantId,
        price: l.price,
        cost: l.cost,
        status,
      },
    });
    listingCount++;
  }
  console.log(`  ✓ ${listingCount} listings (${listingSkipped} skipped)`);

  console.log("\nDone! Database seeded with consignors, products, variants, and listings.");
  console.log("Orders, transactions, and payouts start fresh from real activity.");
  return;

  // ── 5. Orders ──
  console.log("Seeding orders...");
  const orderMap = new Map<string, string>(); // shopifyOrderId -> id
  for (const o of data.orders) {
    const paymentStatus = o.financialStatus === "paid" ? "paid" : "pending";
    const status = o.fulfillmentStatus === "fulfilled" ? "closed" : "open";

    const created = await prisma.order.create({
      data: {
        shopifyId: o.shopifyOrderId,
        orderNumber: o.orderName,
        total: o.totalPrice,
        status,
        paymentStatus,
        createdAt: new Date(o.createdAt),
      },
    });
    orderMap.set(o.shopifyOrderId, created.id);
  }
  console.log(`  ✓ ${orderMap.size} orders`);

  // ── 6. Order Items + Transactions (transaction-driven) ──
  // Transactions are the source of truth: they have consignorEmail + shopifyOrderId + productTitle (with size).
  // This guarantees the correct consignor is linked to each order item.
  console.log("Seeding order items + transactions (transaction-driven)...");

  // Group transactions by shopifyOrderId
  const txsByOrder = new Map<string, typeof data.transactions>();
  for (const tx of data.transactions) {
    const list = txsByOrder.get(tx.shopifyOrderId) || [];
    list.push(tx);
    txsByOrder.set(tx.shopifyOrderId, list);
  }

  // Track used listing IDs to avoid double-linking (each listing = 1 physical item)
  const usedListingIds = new Set<string>();

  let orderItemCount = 0;
  let txCount = 0;
  let skipped = 0;

  for (const [shopifyOrderId, txs] of txsByOrder) {
    const orderId = orderMap.get(shopifyOrderId);
    if (!orderId) {
      skipped += txs.length;
      continue;
    }

    for (const tx of txs) {
      const consignorId = consignorMap.get(tx.consignorEmail.toLowerCase());
      if (!consignorId) {
        skipped++;
        continue;
      }

      // Parse "Product Title - Size" from transaction productTitle
      const lastDash = tx.productTitle.lastIndexOf(" - ");
      let productTitle: string;
      let size: string;
      if (lastDash !== -1) {
        productTitle = tx.productTitle.slice(0, lastDash);
        size = tx.productTitle.slice(lastDash + 3);
      } else {
        productTitle = tx.productTitle;
        size = "";
      }

      // Find listing owned by THIS consignor for THIS product+size
      // Priority: sold + not yet used > any status + not yet used
      const candidates = await prisma.listing.findMany({
        where: {
          consignorId,
          variant: {
            product: { title: productTitle },
            ...(size ? { size } : {}),
          },
        },
        select: { id: true, status: true },
        orderBy: { createdAt: "asc" },
      });

      // Pick best: prefer "sold" and not yet used
      let listing = candidates.find(c => c.status === "sold" && !usedListingIds.has(c.id))
        || candidates.find(c => !usedListingIds.has(c.id));

      if (!listing) {
        // No listing found for this consignor+product — create transaction without order item
        const feeRate = tx.salePrice > 0 ? tx.commissionAmount / tx.salePrice : 0;
        await prisma.transaction.create({
          data: {
            consignorId,
            orderItemId: null,
            type: "sale",
            salePrice: tx.salePrice,
            cost: 0,
            feeRate: Math.round(feeRate * 100) / 100,
            grossAmount: tx.salePrice,
            feeAmount: tx.commissionAmount,
            consignorAmount: tx.consignorPayout,
            amount: tx.consignorPayout,
            createdAt: new Date(tx.createdAt),
          },
        });
        txCount++;
        skipped++;
        continue;
      }

      usedListingIds.add(listing.id);

      // Create OrderItem linked to the correct listing
      const orderItem = await prisma.orderItem.create({
        data: {
          orderId,
          listingId: listing.id,
          price: tx.salePrice,
          status: "sold",
        },
      });
      orderItemCount++;

      // Create Transaction linked to the OrderItem
      const feeRate = tx.salePrice > 0 ? tx.commissionAmount / tx.salePrice : 0;
      await prisma.transaction.create({
        data: {
          consignorId,
          orderItemId: orderItem.id,
          type: "sale",
          salePrice: tx.salePrice,
          cost: 0,
          feeRate: Math.round(feeRate * 100) / 100,
          grossAmount: tx.salePrice,
          feeAmount: tx.commissionAmount,
          consignorAmount: tx.consignorPayout,
          amount: tx.consignorPayout,
          createdAt: new Date(tx.createdAt),
        },
      });
      txCount++;
    }
  }
  console.log(`  ✓ ${orderItemCount} order items, ${txCount} transactions (${skipped} skipped)`);

  console.log("\nDone! Database seeded successfully.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
