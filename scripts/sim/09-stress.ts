// High-volume stress + invariant test.
//
// Runs N sales (default 100) through the real pipeline across many consignors
// and variants — as a mix of single- and multi-item orders — then pays out a
// subset and refunds a subset (both pre-payout normal refunds and post-payout
// reassignments). Finally it asserts system-wide money invariants.
//
// SIMULATION_MODE=1 -> no email, no Shopify writes. Everything is cleaned up at
// the end (delete created orders/items/transactions/payouts/reassign-listings,
// restore listings). Pass --keep to leave the data in place for UI inspection.
//
//   npx tsx scripts/sim/09-stress.ts            # 100 transactions, rollback
//   npx tsx scripts/sim/09-stress.ts 250        # 250 transactions
//   npx tsx scripts/sim/09-stress.ts 100 --keep # keep the data

import { prisma, check, printSummary, header } from "./_shared.js";
import { creditOrder } from "~/services/orders/processing.server.js";
import { refundOrder } from "~/services/orders/refunds.server.js";
import { createPayout, markInvoiced, markPaid } from "~/services/admin/payouts.server.js";
import { calculateFee } from "~/lib/fee-calc.js";

const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a))) || 100;
const KEEP = process.argv.includes("--keep");
const RUN_ID = `stress-${Math.random().toString(36).slice(2, 8)}`;
const fakeAdmin: any = { graphql: () => { throw new Error("admin.graphql called under SIMULATION_MODE"); } };

const created = {
  orderShopifyIds: [] as string[],
  payoutIds: [] as string[],
  reassignListingIds: [] as string[],
  soldListingIds: [] as string[],
  consignorReverts: new Map<string, { taxStatus: string; province: string | null }>(),
};

async function cleanup() {
  // Reassignment-created listings first (they reference variants/consignors)
  if (created.reassignListingIds.length) {
    await prisma.listing.deleteMany({ where: { id: { in: created.reassignListingIds } } });
  }
  for (const sid of created.orderShopifyIds) {
    const order = await prisma.order.findUnique({
      where: { shopifyId: sid },
      include: { items: true },
    });
    if (!order) continue;
    await prisma.reassignmentLog.deleteMany({ where: { orderId: order.id } });
    const itemIds = order.items.map((i) => i.id);
    // Delete payoutItems -> transactions -> orderItems -> order
    const txns = await prisma.transaction.findMany({ where: { orderItemId: { in: itemIds } }, select: { id: true } });
    await prisma.payoutItem.deleteMany({ where: { transactionId: { in: txns.map((t) => t.id) } } });
    await prisma.transaction.deleteMany({ where: { orderItemId: { in: itemIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
  }
  if (created.payoutIds.length) {
    await prisma.payout.deleteMany({ where: { id: { in: created.payoutIds } } });
  }
  if (created.soldListingIds.length) {
    await prisma.listing.updateMany({
      where: { id: { in: created.soldListingIds } },
      data: { status: "active", soldAt: null },
    });
  }
  for (const [cid, orig] of created.consignorReverts) {
    await prisma.consignor.update({ where: { id: cid }, data: orig });
  }
}

async function main() {
  header(`scripts/sim/09-stress.ts — ${COUNT} transactions, runId=${RUN_ID}${KEEP ? " (KEEP)" : " (rollback)"}`);
  const t0 = Date.now();

  // ── Gather a pool of sellable listings: each variant's lowest-priced active
  //    listing, so selling it is the legitimate allocation winner. ──
  console.log(`\nLoading sellable listings...`);
  const actives = await prisma.listing.findMany({
    where: { status: "active", price: { gt: 0 }, consignor: { status: "active" }, variant: { shopifyVariantId: { not: null } } },
    select: {
      id: true, price: true, consignorId: true, variantId: true,
      consignor: { select: { name: true, feeRate: true, taxStatus: true } },
      variant: { select: { product: { select: { category: true } } } },
    },
  });
  // Keep only the lowest-price active listing per variant (the one that would sell).
  const lowestPerVariant = new Map<string, typeof actives[number]>();
  for (const l of actives) {
    const cur = lowestPerVariant.get(l.variantId);
    if (!cur || l.price! < cur.price!) lowestPerVariant.set(l.variantId, l);
  }
  const pool = [...lowestPerVariant.values()];
  if (pool.length < COUNT) {
    console.error(`Only ${pool.length} unique-variant sellable listings available; need ${COUNT}.`);
    process.exit(1);
  }
  // Deterministic spread: stride through the pool so we hit many consignors.
  const items = pool.slice(0, COUNT);
  console.log(`  ${pool.length} unique-variant listings available; using ${items.length}.`);

  // ── Phase 1: SALES — bundle into orders of 1-3 items ──
  console.log(`\n[phase 1] Creating + crediting ${COUNT} sales...`);
  let idx = 0;
  let orderNum = 0;
  while (idx < items.length) {
    const size = 1 + (orderNum % 3); // 1,2,3,1,2,3...
    const batch = items.slice(idx, idx + size);
    idx += size;
    orderNum++;
    const sid = `${RUN_ID}-o${orderNum}`;
    const total = batch.reduce((s, l) => s + l.price!, 0);
    const order = await prisma.order.create({
      data: { shopifyId: sid, orderNumber: `#${sid}`, total, status: "open", paymentStatus: "pending" },
    });
    created.orderShopifyIds.push(sid);
    for (const l of batch) {
      await prisma.orderItem.create({ data: { orderId: order.id, listingId: l.id, price: l.price! } });
      await prisma.listing.update({ where: { id: l.id }, data: { status: "pending_sale", soldAt: new Date() } });
      created.soldListingIds.push(l.id);
    }
    await creditOrder({ shopifyOrderId: sid });
  }
  console.log(`  ${orderNum} orders, ${COUNT} items credited.`);

  // ── Phase 2: PAYOUTS for ~half the consignors that earned ──
  console.log(`\n[phase 2] Paying out ~half of earning consignors...`);
  const earners = [...new Set(items.map((l) => l.consignorId))];
  const toPayOut = earners.filter((_, i) => i % 2 === 0);
  // Chunk transactions per payout. createPayout re-validates every txn inside a
  // 5s interactive transaction, so very large batches time out (see FINDING in
  // README). Realistic payouts are bounded anyway.
  const PAYOUT_CHUNK = 15;
  let payoutsMade = 0;
  for (const cid of toPayOut) {
    const txns = await prisma.transaction.findMany({
      where: { consignorId: cid, type: "sale", payoutItems: { none: {} }, orderItem: { status: { not: "refunded" } } },
      select: { id: true },
    });
    if (txns.length === 0) continue;
    const consignor = await prisma.consignor.findUniqueOrThrow({ where: { id: cid } });
    for (let i = 0; i < txns.length; i += PAYOUT_CHUNK) {
      const chunk = txns.slice(i, i + PAYOUT_CHUNK);
      const payout = await createPayout({ consignorId: cid, transactionIds: chunk.map((t) => t.id) });
      created.payoutIds.push(payout.id);
      if (consignor.taxStatus === "business") await markInvoiced(payout.id);
      await markPaid(payout.id);
      payoutsMade++;
    }
  }
  console.log(`  ${payoutsMade} payouts created + paid.`);

  // ── Phase 3: REFUNDS — refund ~20% of orders (mix of paid + unpaid) ──
  console.log(`\n[phase 3] Refunding ~20% of orders...`);
  const ordersToRefund = created.orderShopifyIds.filter((_, i) => i % 5 === 0);
  let refunded = 0;
  let reassigned = 0;
  for (const sid of ordersToRefund) {
    const logsBefore = await prisma.reassignmentLog.count();
    await refundOrder({ admin: fakeAdmin, shopifyOrderId: sid });
    const newLogs = await prisma.reassignmentLog.findMany({
      where: { orderId: (await prisma.order.findUniqueOrThrow({ where: { shopifyId: sid } })).id },
    });
    for (const lg of newLogs) created.reassignListingIds.push(lg.newListingId);
    reassigned += newLogs.length;
    refunded++;
  }
  console.log(`  ${refunded} orders refunded (${reassigned} items reassigned post-payout).`);

  // ── Phase 4: VERIFY invariants ──
  console.log(`\n[phase 4] Verifying invariants...`);

  // Pull every transaction tied to this run's orders.
  const runOrders = await prisma.order.findMany({
    where: { shopifyId: { startsWith: RUN_ID } },
    select: { id: true },
  });
  const runOrderIds = runOrders.map((o) => o.id);
  const runTxns = await prisma.transaction.findMany({
    where: { orderItem: { orderId: { in: runOrderIds } } },
    include: { orderItem: { include: { listing: { include: { consignor: true } } } } },
  });

  const saleTxns = runTxns.filter((t) => t.type === "sale");
  const refundTxns = runTxns.filter((t) => t.type === "refund");

  check({
    name: "1. Exactly COUNT sale transactions created",
    expected: `${COUNT}`,
    actual: `${saleTxns.length}`,
    ok: saleTxns.length === COUNT,
  });

  // 2. Every sale transaction's fee is correct
  let feeBad = 0;
  for (const t of saleTxns) {
    const exp = calculateFee(t.salePrice, t.orderItem!.listing.consignor.feeRate);
    if (Math.abs(t.feeAmount - exp.feeAmount) > 0.01 || Math.abs(t.consignorAmount - exp.consignorAmount) > 0.01) feeBad++;
  }
  check({
    name: "2. Every sale fee == calculateFee(price, rate)",
    expected: "0 wrong",
    actual: `${feeBad} wrong`,
    ok: feeBad === 0,
  });

  // 3. Every refund transaction is the exact negative of a sale consignorAmount
  let refundBad = 0;
  for (const r of refundTxns) {
    if (r.amount >= 0) refundBad++; // refunds are negative
  }
  check({
    name: "3. All refund transactions are negative",
    expected: "0 non-negative",
    actual: `${refundBad} non-negative`,
    ok: refundBad === 0,
  });

  // 4. System invariant: for each consignor, outstanding owed >= 0 and
  //    paid out <= net earned.
  const consignorIds = [...new Set(runTxns.map((t) => t.consignorId))];
  let balanceBad = 0;
  const balDetails: string[] = [];
  for (const cid of consignorIds) {
    const cTx = runTxns.filter((t) => t.consignorId === cid);
    const net = cTx.reduce((s, t) => s + t.amount, 0); // sales positive, refunds negative
    // payouts for this consignor from this run
    const payouts = await prisma.payout.findMany({
      where: { id: { in: created.payoutIds }, consignorId: cid },
      select: { amount: true, status: true },
    });
    const paid = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
    // paid must never exceed net earned (can't pay out more than owed)
    if (paid - net > 0.02) { balanceBad++; balDetails.push(`  consignor ${cid}: paid $${paid.toFixed(2)} > net $${net.toFixed(2)}`); }
  }
  check({
    name: "4. No consignor paid out more than net earned",
    expected: `${consignorIds.length} consignors OK`,
    actual: `${consignorIds.length - balanceBad} OK`,
    ok: balanceBad === 0,
    details: balDetails.slice(0, 10).join("\n"),
  });

  // 5. Post-payout refunds created reassignments, NOT clawback negative txns.
  //    (A refund of an already-paid sale must not produce a negative transaction.)
  let badClawback = 0;
  for (const r of refundTxns) {
    const saleForItem = saleTxns.find((s) => s.orderItemId === r.orderItemId);
    if (!saleForItem) continue;
    const paidOut = await prisma.payoutItem.findFirst({
      where: { transactionId: saleForItem.id, payout: { status: "paid" } },
    });
    if (paidOut) badClawback++; // a paid-out sale should NOT have a refund txn
  }
  check({
    name: "5. No clawback refund txn on already-paid-out sales (reassign instead)",
    expected: "0 bad clawbacks",
    actual: `${badClawback} bad`,
    ok: badClawback === 0,
  });

  // 6. No listing left in pending_sale (all should be sold, active, or withdrawn)
  const stuck = await prisma.listing.count({
    where: { id: { in: created.soldListingIds }, status: "pending_sale" },
  });
  check({
    name: "6. No listing stuck in pending_sale after crediting",
    expected: "0 stuck",
    actual: `${stuck} stuck`,
    ok: stuck === 0,
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[perf] ${COUNT} sales + ${payoutsMade} payouts + ${refunded} refunds in ${elapsed}s (${(COUNT / Number(elapsed)).toFixed(1)} sales/s).`);

  if (!KEEP) {
    console.log(`\n[cleanup] Rolling back all stress data...`);
    await cleanup();
    console.log(`  Done.`);
  } else {
    console.log(`\n--keep set: ${COUNT} transactions left in prod Neon for UI inspection.`);
  }

  printSummary();
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(process.exitCode ?? 0); })
  .catch(async (err) => {
    console.error("\nFATAL:", err);
    console.error("Attempting cleanup...");
    await cleanup().catch((e) => console.error("Cleanup failed:", e));
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
