/**
 * Trigger a REAL purchase through the production pipeline without going through
 * Shopify checkout. Commits to Neon, decrements real Shopify inventory, and
 * sends the real Item-Sold email.
 *
 * This commits for real (order, transaction, sold listing, Shopify inventory
 * decrement) but does NOT send email:
 *   - NODE_ENV stays "development" -> email.server.ts logs "[DEV] Email would
 *     send" and returns without calling Resend. No email goes out.
 *   - SIMULATION_MODE is NOT set -> syncInventory runs for real against Shopify
 *     using the offline token, so inventory + price actually update.
 *   - NO rollback. The order, transaction, and sold listing persist.
 *
 * Run dry:  npx tsx scripts/trigger-purchase.ts <listingId>
 * Execute:  npx tsx scripts/trigger-purchase.ts <listingId> --go
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Point at Neon prod. Keep NODE_ENV=development so emails are suppressed, and
// leave SIMULATION_MODE unset so Shopify inventory sync runs for real.
function loadNeonDatabaseUrl(): string {
  const envText = fs.readFileSync(path.resolve(__dirname, "../.env"), "utf8");
  const m = envText.match(/^#\s*DATABASE_URL="?(postgresql:\/\/[^"\s]+neon\.tech[^"\s]*)"?/m);
  if (!m) throw new Error("Neon DATABASE_URL not found in .env");
  return m[1];
}
process.env.DATABASE_URL = loadNeonDatabaseUrl();
process.env.NODE_ENV = "development";
delete process.env.SIMULATION_MODE;

const SHOPIFY_API_VERSION = "2024-10";
const GO = process.argv.includes("--go");
const listingId = process.argv.find((a) => !a.startsWith("--") && !a.includes("tsx") && !a.includes("trigger-purchase") && !a.includes("node") && a.length > 10);

// Imports AFTER env is set so prisma picks up the Neon URL.
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const { processOrder, creditOrder } = await import("~/services/orders/processing.server.js");

// Real Shopify admin shim — proxies admin.graphql() to the live store using the
// offline access token. Shape matches AdminApiContext: graphql() returns an
// object whose .json() resolves to { data, extensions }.
function makeRealAdmin(shop: string, token: string): any {
  const endpoint = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  return {
    graphql: async (query: string, opts?: { variables?: Record<string, unknown> }) => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
        body: JSON.stringify({ query, variables: opts?.variables }),
      });
      return { json: async () => res.json() };
    },
  };
}

async function shopifyVariantInventory(admin: any, shopifyVariantId: string): Promise<{ qty: number; price: string }> {
  const resp = await admin.graphql(`
    query($id: ID!) {
      productVariant(id: $id) {
        price
        inventoryQuantity
      }
    }
  `, { variables: { id: shopifyVariantId } });
  const { data } = await resp.json();
  return { qty: data.productVariant?.inventoryQuantity ?? 0, price: data.productVariant?.price ?? "?" };
}

async function main() {
  console.log(`\n=== trigger-purchase.ts — ${GO ? "EXECUTE (real order!)" : "DRY RUN"} ===\n`);

  if (!listingId) {
    console.error("Usage: npx tsx scripts/trigger-purchase.ts <listingId> [--go]");
    process.exit(1);
  }

  // Load the listing + everything we need
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      consignor: true,
      variant: { include: { product: true } },
    },
  });
  if (!listing) throw new Error(`Listing not found: ${listingId}`);
  if (listing.status !== "active") throw new Error(`Listing is ${listing.status}, not active`);
  if (!listing.variant.shopifyVariantId) throw new Error("Listing's variant has no shopifyVariantId");
  if (listing.price == null) throw new Error("Listing has no price");

  const session = await prisma.session.findFirstOrThrow({ where: { accessToken: { not: "" } } });
  const admin = makeRealAdmin(session.shop, session.accessToken);

  // Expected math
  const feeRate = listing.consignor.feeRate;
  const gross = listing.price;
  const feeAmount = Math.round(Number(gross) * feeRate * 100) / 100;
  const consignorAmount = Math.round((Number(gross) - feeAmount) * 100) / 100;

  // Count active listings at this variant's lowest price (drives expected qty after sale)
  const lowest = await prisma.listing.findFirst({
    where: { variantId: listing.variantId, status: "active" },
    orderBy: { price: "asc" },
    select: { price: true },
  });
  const qtyAtLowestBefore = await prisma.listing.count({
    where: { variantId: listing.variantId, status: "active", price: lowest!.price },
  });

  // Shopify state before
  const before = await shopifyVariantInventory(admin, listing.variant.shopifyVariantId);

  console.log(`Item:        ${listing.variant.product.title} (size ${listing.variant.size})`);
  console.log(`Consignor:   ${listing.consignor.name} <${listing.consignor.email}> (fee ${feeRate})`);
  console.log(`Sale price:  $${gross}`);
  console.log(`Shopify variant: ${listing.variant.shopifyVariantId}`);
  console.log(``);
  console.log(`EXPECTED after sale:`);
  console.log(`  - Listing status -> sold`);
  console.log(`  - Transaction: gross $${gross.toFixed(2)}, fee $${feeAmount.toFixed(2)}, consignor gets $${consignorAmount.toFixed(2)}`);
  console.log(`  - Shopify qty: ${before.qty} -> ${before.qty - 1}`);
  console.log(`  - Email: SUPPRESSED (NODE_ENV=development). No email will send.`);
  console.log(``);
  console.log(`Shopify NOW: qty=${before.qty}, price=$${before.price}`);

  if (!GO) {
    console.log(`\nDRY RUN — re-run with --go to actually execute the purchase.\n`);
    return;
  }

  const shopifyOrderId = `manual-${Date.now()}`;
  console.log(`\nExecuting... orderId=${shopifyOrderId}`);

  await processOrder({
    admin,
    shopifyOrderId,
    orderNumber: `#MANUAL-${Date.now().toString().slice(-5)}`,
    lineItems: [{ shopifyVariantId: listing.variant.shopifyVariantId, quantity: 1, price: Number(gross) }],
    financialStatus: "paid",
  });

  // processOrder with financialStatus=paid already calls creditOrder, but call
  // again to be safe — it's idempotent (returns early if already paid).
  await creditOrder({ shopifyOrderId });

  // ── Verify actual outcome ──
  const listingAfter = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
  const order = await prisma.order.findUniqueOrThrow({
    where: { shopifyId: shopifyOrderId },
    include: { items: { include: { transactions: true } } },
  });
  const txn = order.items[0]?.transactions[0];
  const after = await shopifyVariantInventory(admin, listing.variant.shopifyVariantId);

  console.log(`\n=== RESULT (expected vs actual) ===\n`);
  const rows: Array<[string, string, string, boolean]> = [
    ["Listing status", "sold", listingAfter.status, listingAfter.status === "sold"],
    ["Order payment", "paid", order.paymentStatus, order.paymentStatus === "paid"],
    ["Txn gross", `$${Number(gross).toFixed(2)}`, `$${txn?.grossAmount.toFixed(2) ?? "?"}`, !!txn && Math.abs(txn.grossAmount.toNumber() - Number(gross)) < 0.01],
    ["Txn fee", `$${feeAmount.toFixed(2)}`, `$${txn?.feeAmount.toFixed(2) ?? "?"}`, !!txn && Math.abs(txn.feeAmount.toNumber() - feeAmount) < 0.01],
    ["Txn consignor amt", `$${consignorAmount.toFixed(2)}`, `$${txn?.consignorAmount.toFixed(2) ?? "?"}`, !!txn && Math.abs(txn.consignorAmount.toNumber() - consignorAmount) < 0.02],
    ["Shopify qty", `${before.qty - 1}`, `${after.qty}`, after.qty === before.qty - 1],
  ];
  let allOk = true;
  for (const [name, exp, act, ok] of rows) {
    if (!ok) allOk = false;
    console.log(`  [${ok ? "OK " : "XX "}] ${name.padEnd(20)} expected=${String(exp).padEnd(12)} actual=${act}`);
  }

  console.log(`\n${allOk ? "ALL GOOD" : "SOME MISMATCH"}`);
  console.log(`\nOrder ${shopifyOrderId} is now live in Neon. Consignor balance for ${listing.consignor.name} increased by $${consignorAmount.toFixed(2)}.`);
  console.log(`No email was sent (NODE_ENV=development suppressed it).`);
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (err) => { console.error("\nFATAL:", err); await prisma.$disconnect().catch(() => {}); process.exit(1); });
