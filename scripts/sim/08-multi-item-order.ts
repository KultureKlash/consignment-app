// Multi-item / multi-consignor single order verification.
// Builds one order containing several items spanning >=2 consignors, credits
// it, and verifies per-item transactions + per-consignor fee math + balances.
// SIMULATION_MODE=1 suppresses email. Order + transactions cleaned up at end.

import { prisma, check, printSummary, header } from "./_shared.js";
import { creditOrder } from "~/services/orders/processing.server.js";
import { calculateFee } from "~/lib/fee-calc.js";

const RUN_ID = `sim-multi-${Math.random().toString(36).slice(2, 10)}`;
let orderId: string | null = null;
const soldListingIds: string[] = [];

async function cleanup() {
  if (orderId) {
    const items = await prisma.orderItem.findMany({ where: { orderId }, select: { id: true } });
    await prisma.transaction.deleteMany({ where: { orderItemId: { in: items.map((i) => i.id) } } });
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
  }
  if (soldListingIds.length > 0) {
    await prisma.listing.updateMany({
      where: { id: { in: soldListingIds } },
      data: { status: "active", soldAt: null },
    });
  }
}

async function main() {
  header("scripts/sim/08-multi-item-order.ts");

  // Pick active listings from at least 2 distinct consignors.
  const candidates = await prisma.listing.findMany({
    where: { status: "active", price: { gt: 0 }, consignor: { status: "active" } },
    select: { id: true, price: true, consignorId: true, consignor: { select: { name: true, feeRate: true } } },
    take: 200,
  });
  // Group by consignor, pick items from the first 3 distinct consignors.
  const byConsignor = new Map<string, typeof candidates>();
  for (const l of candidates) {
    const arr = byConsignor.get(l.consignorId) ?? [];
    if (arr.length < 2) arr.push(l);
    byConsignor.set(l.consignorId, arr);
  }
  const picked: typeof candidates = [];
  let consignorsUsed = 0;
  for (const [, items] of byConsignor) {
    if (consignorsUsed >= 3) break;
    picked.push(...items);
    consignorsUsed++;
  }
  if (consignorsUsed < 2) { console.error("Need >=2 consignors with active listings"); process.exit(1); }

  console.log(`\nBuilding 1 order with ${picked.length} items across ${consignorsUsed} consignors:`);
  for (const l of picked) console.log(`  ${l.consignor.name} (fee ${l.consignor.feeRate}): $${l.price} [${l.id}]`);

  const orderTotal = picked.reduce((s, l) => s + l.price!.toNumber(), 0);

  // Build the order directly (allocation correctness is covered by 02-allocation.ts).
  const shopifyOrderId = `${RUN_ID}`;
  const order = await prisma.order.create({
    data: { shopifyId: shopifyOrderId, orderNumber: `#${RUN_ID}`, total: orderTotal, status: "open", paymentStatus: "pending" },
  });
  orderId = order.id;
  for (const l of picked) {
    await prisma.orderItem.create({ data: { orderId: order.id, listingId: l.id, price: l.price! } });
    await prisma.listing.update({ where: { id: l.id }, data: { status: "pending_sale", soldAt: new Date() } });
    soldListingIds.push(l.id);
  }

  // Credit the whole order
  await creditOrder({ shopifyOrderId });

  // ── Verify ──
  const txns = await prisma.transaction.findMany({
    where: { orderItem: { orderId: order.id } },
    include: { orderItem: { include: { listing: { include: { consignor: true } } } } },
  });

  check({
    name: "1. One sale transaction per item",
    expected: `${picked.length} transactions`,
    actual: `${txns.length}`,
    ok: txns.length === picked.length,
  });

  // Per-transaction fee math
  let feeOk = 0;
  const feeMismatches: string[] = [];
  for (const t of txns) {
    const expected = calculateFee(t.salePrice, t.orderItem!.listing.consignor.feeRate);
    if (Math.abs(t.feeAmount.toNumber() - expected.feeAmount.toNumber()) < 0.01 && Math.abs(t.consignorAmount.toNumber() - expected.consignorAmount.toNumber()) < 0.01) {
      feeOk++;
    } else {
      feeMismatches.push(`  ${t.orderItem!.listing.consignor.name}: $${t.salePrice} -> expected fee $${expected.feeAmount.toFixed(2)}, got $${t.feeAmount.toFixed(2)}`);
    }
  }
  check({
    name: "2. Each transaction's fee matches calculateFee() for its consignor's rate",
    expected: `${picked.length} correct`,
    actual: `${feeOk} correct`,
    ok: feeOk === picked.length,
    details: feeMismatches.join("\n"),
  });

  // Per-consignor balance = sum of their items' consignorAmount
  const expectedByConsignor = new Map<string, number>();
  for (const l of picked) {
    const fee = calculateFee(l.price!, l.consignor.feeRate);
    expectedByConsignor.set(l.consignorId, (expectedByConsignor.get(l.consignorId) ?? 0) + fee.consignorAmount.toNumber());
  }
  let balanceOk = 0;
  const balMismatches: string[] = [];
  for (const [cid, expectedAmt] of expectedByConsignor) {
    const actual = txns.filter((t) => t.orderItem!.listing.consignorId === cid).reduce((s, t) => s + t.amount.toNumber(), 0);
    if (Math.abs(actual - expectedAmt) < 0.02) balanceOk++;
    else balMismatches.push(`  consignor ${cid}: expected $${expectedAmt.toFixed(2)}, got $${actual.toFixed(2)}`);
  }
  check({
    name: "3. Per-consignor credited amount = sum of their items",
    expected: `${expectedByConsignor.size} consignors balanced`,
    actual: `${balanceOk} balanced`,
    ok: balanceOk === expectedByConsignor.size,
    details: balMismatches.join("\n"),
  });

  // All listings now SOLD
  const stillNotSold = await prisma.listing.count({ where: { id: { in: soldListingIds }, status: { not: "sold" } } });
  check({
    name: "4. All items in the order are marked sold",
    expected: "0 not-sold",
    actual: `${stillNotSold} not-sold`,
    ok: stillNotSold === 0,
  });

  // Order marked paid
  const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  check({
    name: "5. Order payment status = paid",
    expected: "paid",
    actual: orderAfter.paymentStatus,
    ok: orderAfter.paymentStatus === "paid",
  });

  await cleanup();
  console.log(`\n[cleanup] order + ${soldListingIds.length} listings restored.`);
  printSummary();
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(process.exitCode ?? 0); })
  .catch(async (err) => { console.error("\nFATAL:", err); await cleanup().catch(() => {}); await prisma.$disconnect().catch(() => {}); process.exit(1); });
