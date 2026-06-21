// End-to-end lifecycle simulation against prod Neon. Each scenario:
//   1. Picks real consignors/variants matching the scenario's traits.
//   2. Runs the production service functions (processOrder/creditOrder/
//      markPaid/refundOrder/...) with SIMULATION_MODE=1 so email + Shopify
//      sync are skipped.
//   3. Captures every entity created and its expected vs actual state.
//   4. Cleans up all created entities at the end (delete by tracked IDs).
//
// Dry-run by default. Pass --go to actually execute against Neon.
// On crash mid-scenario the cleanup path runs; orphans are reported.

import { prisma, check, printSummary, header } from "./_shared.js";
import { processOrder, creditOrder } from "~/services/orders/processing.server.js";
import { refundOrder } from "~/services/orders/refunds.server.js";
import { createPayout, markInvoiced, markPaid } from "~/services/admin/payouts.server.js";
import { calculateFee } from "~/lib/fee-calc.js";

const GO = process.argv.includes("--go");
const RUN_ID = `sim-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
// Fake admin object — never invoked because SIMULATION_MODE=1 short-circuits syncInventory.
const fakeAdmin: any = { graphql: () => { throw new Error("admin.graphql called during SIMULATION_MODE"); } };

// ── Cleanup tracking ──

type Created = {
  orderShopifyIds: Set<string>;
  newListingIds: Set<string>;
  consignorReverts: Map<string, { taxStatus: string; province: string | null }>;
};
const created: Created = {
  orderShopifyIds: new Set(),
  newListingIds: new Set(),
  consignorReverts: new Map(),
};

async function cleanup() {
  console.log(`\n[cleanup] Deleting tracked entities for run ${RUN_ID}...`);

  // Revert consignor mutations first
  for (const [consignorId, original] of created.consignorReverts) {
    await prisma.consignor.update({
      where: { id: consignorId },
      data: { taxStatus: original.taxStatus, province: original.province },
    });
  }

  // Delete in FK-safe order
  for (const shopifyId of created.orderShopifyIds) {
    const order = await prisma.order.findUnique({
      where: { shopifyId },
      include: { items: { include: { transactions: { include: { payoutItems: { include: { payout: true } } } } } } },
    });
    if (!order) continue;

    // Collect payout ids transitively
    const payoutIds = new Set<string>();
    for (const it of order.items) {
      for (const t of it.transactions) {
        for (const pi of t.payoutItems) payoutIds.add(pi.payout.id);
      }
    }

    // Delete reassignment logs by orderId
    await prisma.reassignmentLog.deleteMany({ where: { orderId: order.id } });

    // Delete payouts (cascades to PayoutItem)
    if (payoutIds.size > 0) await prisma.payout.deleteMany({ where: { id: { in: [...payoutIds] } } });

    // Restore SOLD listings linked via OrderItem to ACTIVE-ish state for refund-side, but easier:
    // just delete transactions -> orderItems -> order. Listings that were SOLD get their soldAt/status
    // restored to whatever they need.
    const listingsToRestore = order.items.map((it) => it.listingId);
    await prisma.transaction.deleteMany({ where: { orderItemId: { in: order.items.map((it) => it.id) } } });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });

    // Restore listings that we marked SOLD/PENDING_SALE back to ACTIVE.
    // Reassignment-created (new) listings are excluded — they get deleted below.
    const restoreIds = listingsToRestore.filter((id) => !created.newListingIds.has(id));
    if (restoreIds.length > 0) {
      await prisma.listing.updateMany({
        where: { id: { in: restoreIds } },
        data: { status: "active", soldAt: null },
      });
    }
  }

  // Delete listings we created (scenario B fresh listings + reassignment-created new listings)
  if (created.newListingIds.size > 0) {
    await prisma.listing.deleteMany({ where: { id: { in: [...created.newListingIds] } } });
  }

  // Verify no orphans tagged with RUN_ID remain
  const orphanOrders = await prisma.order.count({ where: { shopifyId: { startsWith: RUN_ID } } });
  if (orphanOrders > 0) {
    console.error(`  WARNING: ${orphanOrders} orphan orders remain. Manual cleanup may be needed.`);
  } else {
    console.log(`  Cleanup OK.`);
  }
}

// ── Helpers ──

async function pickConsignor(traits: { taxStatus?: string; storeOwned?: boolean; minListings?: number }): Promise<{ id: string; name: string; feeRate: number; taxStatus: string; province: string | null }> {
  const consignors = await prisma.consignor.findMany({
    where: {
      status: "active",
      ...(traits.taxStatus ? { taxStatus: traits.taxStatus } : {}),
      ...(traits.storeOwned !== undefined ? { storeOwned: traits.storeOwned } : {}),
    },
    select: {
      id: true, name: true, feeRate: true, taxStatus: true, province: true,
      _count: { select: { listings: { where: { status: "active" } } } },
    },
  });
  const minListings = traits.minListings ?? 1;
  const eligible = consignors.filter((c) => c._count.listings >= minListings);
  if (eligible.length === 0) throw new Error(`No consignor matches traits: ${JSON.stringify(traits)}`);
  eligible.sort((a, b) => b._count.listings - a._count.listings);
  return eligible[0];
}

async function pickListingForConsignor(consignorId: string, opts: { category?: "footwear" | "apparel" } = {}): Promise<{ id: string; price: number; variantId: string; shopifyVariantId: string; productCategory: string | null; productTitle: string; size: string }> {
  const listings = await prisma.listing.findMany({
    where: { status: "active", consignorId, variant: { shopifyVariantId: { not: null } } },
    select: {
      id: true, price: true, variantId: true,
      variant: { select: { size: true, shopifyVariantId: true, product: { select: { title: true, category: true } } } },
    },
    take: 100,
  });
  let pool = listings;
  // Match the refund code's classification (refunds.server.ts:229):
  //   isFootwear = !category || category.startsWith("Footwear")
  if (opts.category === "footwear") {
    pool = listings.filter((l) => {
      const c = l.variant.product.category;
      return !c || c.startsWith("Footwear");
    });
  } else if (opts.category === "apparel") {
    pool = listings.filter((l) => {
      const c = l.variant.product.category;
      return c && !c.startsWith("Footwear");
    });
  }
  if (pool.length === 0) throw new Error(`No active listing for consignor ${consignorId} matching ${JSON.stringify(opts)}`);
  const l = pool[0];
  return {
    id: l.id,
    price: l.price!,
    variantId: l.variantId,
    shopifyVariantId: l.variant.shopifyVariantId!,
    productCategory: l.variant.product.category,
    productTitle: l.variant.product.title,
    size: l.variant.size,
  };
}

// ── Scenarios ──

// Directly create Order + OrderItem on a specific listing — bypasses allocation
// (which is exhaustively tested in 02-allocation.ts). Returns the orderId.
async function directSell(shopifyOrderId: string, listingId: string, price: number): Promise<string> {
  const order = await prisma.order.create({
    data: {
      shopifyId: shopifyOrderId,
      orderNumber: `#${shopifyOrderId}`,
      total: price,
      status: "open",
      paymentStatus: "pending",
    },
  });
  await prisma.orderItem.create({
    data: { orderId: order.id, listingId, price },
  });
  await prisma.listing.update({
    where: { id: listingId },
    data: { status: "pending_sale", soldAt: new Date() },
  });
  return order.id;
}

async function scenarioA() {
  console.log(`\n${"=".repeat(60)}\nA. Individual sale (real consignor, real listing)\n${"=".repeat(60)}`);
  const consignor = await pickConsignor({ taxStatus: "individual", storeOwned: false, minListings: 5 });
  const listing = await pickListingForConsignor(consignor.id);
  const expected = calculateFee(listing.price, consignor.feeRate);
  const shopifyOrderId = `${RUN_ID}-A`;
  created.orderShopifyIds.add(shopifyOrderId);

  console.log(`  Consignor: ${consignor.name} (feeRate=${consignor.feeRate}, tax=${consignor.taxStatus})`);
  console.log(`  Item:      ${listing.productTitle} (size ${listing.size}) @ $${listing.price}`);

  await directSell(shopifyOrderId, listing.id, listing.price);
  await creditOrder({ shopifyOrderId });

  const listingAfter = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
  const txn = await prisma.transaction.findFirst({ where: { orderItem: { order: { shopifyId: shopifyOrderId } } } });

  check({
    name: "A1. Listing transitions to SOLD",
    expected: "status=sold",
    actual: `status=${listingAfter.status}`,
    ok: listingAfter.status === "sold",
  });
  check({
    name: "A2. Transaction.feeAmount matches calculateFee()",
    expected: `${expected.feeAmount.toFixed(2)}`,
    actual: `${txn?.feeAmount.toFixed(2) ?? "(no txn)"}`,
    ok: !!txn && Math.abs(txn.feeAmount - expected.feeAmount) < 0.01,
  });
  check({
    name: "A3. Transaction.consignorAmount matches calculateFee()",
    expected: `${expected.consignorAmount.toFixed(2)}`,
    actual: `${txn?.consignorAmount.toFixed(2) ?? "(no txn)"}`,
    ok: !!txn && Math.abs(txn.consignorAmount - expected.consignorAmount) < 0.01,
  });
  check({
    name: "A4. Transaction.type = sale",
    expected: "sale",
    actual: `${txn?.type ?? "(none)"}`,
    ok: txn?.type === "sale",
  });
}

async function scenarioB() {
  console.log(`\n${"=".repeat(60)}\nB. Same-price FIFO tiebreak (via processOrder allocation)\n${"=".repeat(60)}`);
  const consignor = await pickConsignor({ taxStatus: "individual", storeOwned: false, minListings: 1 });
  const aListing = await pickListingForConsignor(consignor.id);

  // Pick a price strictly lower than any existing active listing on this
  // variant so the allocation SQL picks our fresh listings.
  const lowest = await prisma.listing.findFirst({
    where: { variantId: aListing.variantId, status: "active" },
    orderBy: { price: "asc" },
    select: { price: true },
  });
  const fixedPrice = lowest?.price ? Math.max(0.01, Math.round((lowest.price - 1) * 100) / 100) : 1.0;
  const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const newDate = new Date();

  const olderListing = await prisma.listing.create({
    data: { consignorId: consignor.id, variantId: aListing.variantId, price: fixedPrice, status: "active", listedAt: oldDate, createdAt: oldDate },
  });
  created.newListingIds.add(olderListing.id);
  const newerListing = await prisma.listing.create({
    data: { consignorId: consignor.id, variantId: aListing.variantId, price: fixedPrice, status: "active", listedAt: newDate, createdAt: newDate },
  });
  created.newListingIds.add(newerListing.id);

  console.log(`  Variant: ${aListing.productTitle} (${aListing.size})`);
  console.log(`  Two fresh listings at $${fixedPrice}; existing market floor was $${lowest?.price ?? "(none)"}`);
  console.log(`  Older listing: ${olderListing.id} createdAt=${oldDate.toISOString()}`);
  console.log(`  Newer listing: ${newerListing.id} createdAt=${newDate.toISOString()}`);

  const shopifyOrderId = `${RUN_ID}-B`;
  created.orderShopifyIds.add(shopifyOrderId);
  await processOrder({
    admin: fakeAdmin,
    shopifyOrderId,
    lineItems: [{ shopifyVariantId: aListing.shopifyVariantId, quantity: 1, price: fixedPrice }],
  });

  const olderAfter = await prisma.listing.findUniqueOrThrow({ where: { id: olderListing.id } });
  const newerAfter = await prisma.listing.findUniqueOrThrow({ where: { id: newerListing.id } });

  check({
    name: "B1. Allocation picks the OLDER of two same-price listings (FIFO)",
    expected: "older=pending_sale, newer=active",
    actual: `older.status=${olderAfter.status}, newer.status=${newerAfter.status}`,
    ok: olderAfter.status === "pending_sale" && newerAfter.status === "active",
  });
}

async function scenarioC() {
  console.log(`\n${"=".repeat(60)}\nC. Business markPaid happy path (invoice flow)\n${"=".repeat(60)}`);
  let consignor;
  try {
    consignor = await pickConsignor({ taxStatus: "business", minListings: 3 });
  } catch {
    console.log("  SKIP: no business consignor with active listings found.");
    return;
  }
  const listing = await pickListingForConsignor(consignor.id);
  const shopifyOrderId = `${RUN_ID}-C`;
  created.orderShopifyIds.add(shopifyOrderId);

  console.log(`  Consignor: ${consignor.name} (feeRate=${consignor.feeRate}, tax=business)`);
  console.log(`  Item:      ${listing.productTitle} (size ${listing.size}) @ $${listing.price}`);

  await directSell(shopifyOrderId, listing.id, listing.price);
  await creditOrder({ shopifyOrderId });

  const txn = await prisma.transaction.findFirstOrThrow({ where: { orderItem: { order: { shopifyId: shopifyOrderId } } } });
  const payout = await createPayout({ consignorId: consignor.id, transactionIds: [txn.id] });

  check({
    name: "C1. Payout created in PENDING state",
    expected: "pending",
    actual: payout.status,
    ok: payout.status === "pending",
  });

  let didThrow = false;
  try {
    await markPaid(payout.id);
  } catch { didThrow = true; }
  check({
    name: "C2. markPaid() rejects business consignor before invoice",
    expected: "throws (business requires INVOICED)",
    actual: didThrow ? "threw" : "did NOT throw",
    ok: didThrow,
  });

  const invoiced = await markInvoiced(payout.id);
  check({
    name: "C3. markInvoiced() transitions PENDING -> INVOICED",
    expected: "invoiced",
    actual: invoiced.status,
    ok: invoiced.status === "invoiced",
  });

  const paid = await markPaid(payout.id);
  check({
    name: "C4. markPaid() transitions INVOICED -> PAID for business",
    expected: "paid",
    actual: paid.status,
    ok: paid.status === "paid",
  });
}

async function scenarioD() {
  console.log(`\n${"=".repeat(60)}\nD. Pay-without-invoice override\n${"=".repeat(60)}`);
  const consignor = await pickConsignor({ taxStatus: "individual", storeOwned: false, minListings: 3 });
  // Temporarily flip to business so the rule applies
  created.consignorReverts.set(consignor.id, { taxStatus: consignor.taxStatus, province: consignor.province });
  await prisma.consignor.update({ where: { id: consignor.id }, data: { taxStatus: "business", province: "QC" } });

  const listing = await pickListingForConsignor(consignor.id);
  const shopifyOrderId = `${RUN_ID}-D`;
  created.orderShopifyIds.add(shopifyOrderId);

  console.log(`  Consignor: ${consignor.name} (temporarily flipped to business+QC)`);
  console.log(`  Item:      ${listing.productTitle} (size ${listing.size}) @ $${listing.price}`);

  await directSell(shopifyOrderId, listing.id, listing.price);
  await creditOrder({ shopifyOrderId });
  const txn = await prisma.transaction.findFirstOrThrow({ where: { orderItem: { order: { shopifyId: shopifyOrderId } } } });
  const payout = await createPayout({ consignorId: consignor.id, transactionIds: [txn.id] });

  let didThrowWithout = false;
  try { await markPaid(payout.id); } catch { didThrowWithout = true; }
  check({
    name: "D1. markPaid() WITHOUT override rejects business consignor",
    expected: "throws",
    actual: didThrowWithout ? "threw" : "did NOT throw",
    ok: didThrowWithout,
  });

  const paid = await markPaid(payout.id, { allowMissingInvoice: true });
  check({
    name: "D2. markPaid({allowMissingInvoice:true}) succeeds for business",
    expected: "paid",
    actual: paid.status,
    ok: paid.status === "paid",
  });
}

async function scenarioE(category: "footwear" | "apparel") {
  console.log(`\n${"=".repeat(60)}\nE.${category}: Post-payout refund / ReassignmentLog\n${"=".repeat(60)}`);
  const consignor = await pickConsignor({ taxStatus: "individual", storeOwned: false, minListings: 5 });
  let listing;
  try {
    listing = await pickListingForConsignor(consignor.id, { category });
  } catch (err) {
    console.log(`  SKIP: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const shopifyOrderId = `${RUN_ID}-E-${category}`;
  created.orderShopifyIds.add(shopifyOrderId);

  console.log(`  Consignor: ${consignor.name}`);
  console.log(`  Item:      ${listing.productTitle} (size ${listing.size}) @ $${listing.price} [category=${listing.productCategory ?? "?"}]`);

  await directSell(shopifyOrderId, listing.id, listing.price);
  await creditOrder({ shopifyOrderId });
  const txn = await prisma.transaction.findFirstOrThrow({ where: { orderItem: { order: { shopifyId: shopifyOrderId } } } });
  const payout = await createPayout({ consignorId: consignor.id, transactionIds: [txn.id] });
  // Individual consignor: can mark paid from PENDING
  await markPaid(payout.id);

  // Now refund
  await refundOrder({ admin: fakeAdmin, shopifyOrderId });

  const log = await prisma.reassignmentLog.findFirst({ where: { originalListingId: listing.id } });
  const originalAfter = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });

  check({
    name: `E.${category}.1: ReassignmentLog created with reason=post_payout_refund`,
    expected: "1 row, reason=post_payout_refund",
    actual: log ? `id=${log.id}, reason=${log.reason}` : "(none)",
    ok: !!log && log.reason === "post_payout_refund",
  });
  check({
    name: `E.${category}.2: Original listing stays SOLD (paid already)`,
    expected: "sold",
    actual: originalAfter.status,
    ok: originalAfter.status === "sold",
  });
  if (log) {
    created.newListingIds.add(log.newListingId);
    const newListing = await prisma.listing.findUniqueOrThrow({ where: { id: log.newListingId } });
    const newConsignor = await prisma.consignor.findUniqueOrThrow({ where: { id: log.newConsignorId } });
    const expectedName = category === "footwear" ? "Kulture Klash" : "Kulture Klothing";
    check({
      name: `E.${category}.3: New listing assigned to correct shop consignor`,
      expected: expectedName,
      actual: `${newConsignor.name} (${newConsignor.email})`,
      ok: newConsignor.name === expectedName,
    });
    check({
      name: `E.${category}.4: New listing is ACTIVE under shop consignor`,
      expected: "active",
      actual: newListing.status,
      ok: newListing.status === "active",
    });
  }
}

// ── Main ──

async function main() {
  header(`scripts/sim/03-lifecycle.ts — runId=${RUN_ID}`);

  if (!GO) {
    console.log(`\nDRY RUN. Would execute 6 scenarios on prod Neon. Re-run with --go to actually do it.`);
    console.log(`Cleanup is automatic; on crash, orphaned shopifyIds will start with "${RUN_ID}".\n`);
    return;
  }

  console.log(`\nSIMULATION_MODE=1 set in _shared.ts → emails + Shopify sync are no-ops.\n`);

  try {
    await scenarioA();
    await scenarioB();
    await scenarioC();
    await scenarioD();
    await scenarioE("footwear");
    await scenarioE("apparel");
  } finally {
    await cleanup();
  }

  printSummary();
}

main()
  .catch((err) => { console.error("\nFATAL:", err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
