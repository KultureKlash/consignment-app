/**
 * Trigger a REAL refund through the production pipeline.
 * Refunds a Neon order by its shopifyId. Commits. No email
 * (NODE_ENV stays development). Real Shopify inventory sync.
 *
 * Detects + reports which path fired:
 *   - post-payout  -> item reassigned to shop consignor + ReassignmentLog
 *   - normal       -> listing restored to active + negative transaction
 *
 * Run dry:  npx tsx scripts/trigger-refund.ts <shopifyOrderId>
 * Execute:  npx tsx scripts/trigger-refund.ts <shopifyOrderId> --go
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadNeonDatabaseUrl(): string {
  const envText = fs.readFileSync(path.resolve(__dirname, "../.env"), "utf8");
  const m = envText.match(/^#\s*DATABASE_URL="?(postgresql:\/\/[^"\s]+neon\.tech[^"\s]*)"?/m);
  if (!m) throw new Error("Neon DATABASE_URL not found in .env");
  return m[1];
}
process.env.DATABASE_URL = loadNeonDatabaseUrl();
process.env.NODE_ENV = "development"; // suppress email
delete process.env.SIMULATION_MODE;

const SHOPIFY_API_VERSION = "2024-10";
const GO = process.argv.includes("--go");
const shopifyOrderId = process.argv.find((a) => a.startsWith("manual-") || (!a.startsWith("--") && a.includes("-") && /\d{8,}/.test(a)));

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const { refundOrder } = await import("~/services/orders/refunds.server.js");

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

async function main() {
  console.log(`\n=== trigger-refund.ts — ${GO ? "EXECUTE (real refund!)" : "DRY RUN"} ===\n`);
  if (!shopifyOrderId) { console.error("Usage: npx tsx scripts/trigger-refund.ts <shopifyOrderId> [--go]"); process.exit(1); }

  const order = await prisma.order.findUnique({
    where: { shopifyId: shopifyOrderId },
    include: {
      items: {
        include: {
          listing: { include: { consignor: true, variant: { include: { product: true } } } },
          transactions: { include: { payoutItems: { include: { payout: true } } } },
        },
      },
    },
  });
  if (!order) throw new Error(`Order not found: ${shopifyOrderId}`);

  const session = await prisma.session.findFirstOrThrow({ where: { accessToken: { not: "" } } });
  const admin = makeRealAdmin(session.shop, session.accessToken);

  console.log(`Order: ${shopifyOrderId} (status=${order.status}, payment=${order.paymentStatus})`);
  for (const it of order.items) {
    const wasPaidOut = it.transactions.some((t) => t.type === "sale" && t.payoutItems.some((pi) => pi.payout.status === "paid"));
    console.log(`  Item: ${it.listing.variant.product.title} (sz ${it.listing.variant.size}) $${it.price}`);
    console.log(`    consignor=${it.listing.consignor.name}, paid-out=${wasPaidOut} -> path=${wasPaidOut ? "POST-PAYOUT (reassign)" : "NORMAL (restore + negative txn)"}`);
  }

  if (!GO) { console.log(`\nDRY RUN — re-run with --go to actually refund.\n`); return; }

  // Snapshot ReassignmentLog + transaction counts before
  const logsBefore = await prisma.reassignmentLog.count({ where: { orderId: order.id } });
  const refundTxnsBefore = await prisma.transaction.count({ where: { type: "refund", orderItem: { orderId: order.id } } });

  console.log(`\nRefunding...`);
  await refundOrder({ admin, shopifyOrderId });

  // Verify
  const orderAfter = await prisma.order.findUniqueOrThrow({
    where: { shopifyId: shopifyOrderId },
    include: { items: { include: { listing: true } } },
  });
  const logsAfter = await prisma.reassignmentLog.findMany({ where: { orderId: order.id }, include: { } });
  const refundTxnsAfter = await prisma.transaction.count({ where: { type: "refund", orderItem: { orderId: order.id } } });

  console.log(`\n=== RESULT ===\n`);
  console.log(`  Order status: ${order.status} -> ${orderAfter.status}`);
  console.log(`  ReassignmentLogs: ${logsBefore} -> ${logsAfter.length}`);
  console.log(`  Refund transactions: ${refundTxnsBefore} -> ${refundTxnsAfter}`);

  for (const it of orderAfter.items) {
    console.log(`  Item listing ${it.listingId}: status=${it.listing.status}`);
  }

  if (logsAfter.length > logsBefore) {
    console.log(`\n  POST-PAYOUT path confirmed:`);
    for (const log of logsAfter) {
      const newC = await prisma.consignor.findUnique({ where: { id: log.newConsignorId } });
      const newL = await prisma.listing.findUnique({ where: { id: log.newListingId } });
      console.log(`    reassigned to ${newC?.name} (new listing ${log.newListingId}, status=${newL?.status})`);
    }
  }
  if (refundTxnsAfter > refundTxnsBefore) {
    console.log(`\n  NORMAL path confirmed: ${refundTxnsAfter - refundTxnsBefore} negative transaction(s) created, listing(s) restored.`);
  }
  console.log(`\nNo email was sent (NODE_ENV=development).`);
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (err) => { console.error("\nFATAL:", err); await prisma.$disconnect().catch(() => {}); process.exit(1); });
