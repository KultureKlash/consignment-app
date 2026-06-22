// One-off: prove createPayout handles a large transaction batch without the
// 5s interactive-transaction timeout (finding #3 fix). Creates 150 synthetic
// sales for one consignor, bundles ALL into a single payout, times it, then
// rolls everything back. SIMULATION_MODE=1 (no email/Shopify).

import { prisma, check, printSummary, header } from "./_shared.js";
import { creditOrder } from "~/services/orders/processing.server.js";
import { createPayout, markInvoiced, markPaid } from "~/services/admin/payouts.server.js";

const N = 150;
const RUN_ID = `lpay-${Math.random().toString(36).slice(2, 8)}`;
const created = { orderShopifyIds: [] as string[], payoutIds: [] as string[], soldListingIds: [] as string[] };

async function cleanup() {
  for (const sid of created.orderShopifyIds) {
    const order = await prisma.order.findUnique({ where: { shopifyId: sid }, include: { items: true } });
    if (!order) continue;
    const itemIds = order.items.map((i) => i.id);
    const txns = await prisma.transaction.findMany({ where: { orderItemId: { in: itemIds } }, select: { id: true } });
    await prisma.payoutItem.deleteMany({ where: { transactionId: { in: txns.map((t) => t.id) } } });
    await prisma.transaction.deleteMany({ where: { orderItemId: { in: itemIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
  }
  if (created.payoutIds.length) await prisma.payout.deleteMany({ where: { id: { in: created.payoutIds } } });
  if (created.soldListingIds.length) {
    await prisma.listing.updateMany({ where: { id: { in: created.soldListingIds } }, data: { status: "active", soldAt: null } });
  }
}

async function main() {
  header(`scripts/sim/verify-large-payout.ts — single payout of ${N} transactions`);

  const consignor = await prisma.consignor.findFirstOrThrow({
    where: { status: "active", storeOwned: false },
    orderBy: { listings: { _count: "desc" } },
  });
  const listings = await prisma.listing.findMany({
    where: { status: "active", consignorId: consignor.id, price: { gt: 0 }, variant: { shopifyVariantId: { not: null } } },
    select: { id: true, price: true },
    take: N,
  });
  if (listings.length < N) { console.error(`Consignor ${consignor.name} has only ${listings.length} active listings; need ${N}`); process.exit(1); }
  console.log(`\nConsignor: ${consignor.name} (tax=${consignor.taxStatus}). Selling ${N} items, then ONE payout for all.`);

  // Create N sales as small orders (3 items each) so creditOrder stays well
  // under its own transaction budget — we're isolating the createPayout path.
  for (let i = 0; i < listings.length; i += 3) {
    const batch = listings.slice(i, i + 3);
    const sid = `${RUN_ID}-o${i}`;
    const order = await prisma.order.create({ data: { shopifyId: sid, orderNumber: `#${sid}`, total: 0, status: "open", paymentStatus: "pending" } });
    created.orderShopifyIds.push(sid);
    for (const l of batch) {
      await prisma.orderItem.create({ data: { orderId: order.id, listingId: l.id, price: l.price! } });
      await prisma.listing.update({ where: { id: l.id }, data: { status: "pending_sale", soldAt: new Date() } });
      created.soldListingIds.push(l.id);
    }
    await creditOrder({ shopifyOrderId: sid });
  }

  const txns = await prisma.transaction.findMany({
    where: { consignorId: consignor.id, type: "sale", payoutItems: { none: {} }, orderItem: { order: { shopifyId: { startsWith: RUN_ID } } } },
    select: { id: true },
  });

  console.log(`Bundling ${txns.length} transactions into one payout...`);
  const t0 = Date.now();
  let err: string | null = null;
  let payoutOk = false;
  try {
    const payout = await createPayout({ consignorId: consignor.id, transactionIds: txns.map((t) => t.id) });
    created.payoutIds.push(payout.id);
    if (consignor.taxStatus === "business") await markInvoiced(payout.id);
    await markPaid(payout.id);
    payoutOk = true;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  const elapsed = Date.now() - t0;

  check({
    name: `createPayout + markPaid for ${N}-transaction batch`,
    expected: "succeeds (no 5s timeout)",
    actual: payoutOk ? `succeeded in ${elapsed}ms` : `FAILED: ${err}`,
    ok: payoutOk,
  });

  await cleanup();
  console.log(`\n[cleanup] done.`);
  printSummary();
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(process.exitCode ?? 0); })
  .catch(async (e) => { console.error("\nFATAL:", e); await cleanup().catch(() => {}); await prisma.$disconnect().catch(() => {}); process.exit(1); });
