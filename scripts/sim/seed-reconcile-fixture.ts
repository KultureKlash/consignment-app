// Synthetic fixture so scripts/sim/10-reconcile-shopify.ts has something real to
// reconcile. Without it the reconciler exits 2 (no stored payloads in range, and
// the Shopify offline token expires every 20-30 minutes), which makes a
// before/after comparison vacuous.
//
// Creates two orders against real catalog listings, plus the WebhookEvent
// payloads Shopify would have sent for them:
//
//   order 1  two items, no discount          -> must reconcile exactly
//   order 2  one item, discount > store fee  -> must fire INFO + WARN, still balance
//
// Everything is tagged with RECONCILE_FIXTURE so --clean can remove exactly what
// it made. Deterministic shopifyIds, so re-running replaces rather than
// accumulates.
//
//   npx tsx scripts/sim/seed-reconcile-fixture.ts          # create
//   npx tsx scripts/sim/seed-reconcile-fixture.ts --clean   # remove
//
// SIMULATION_MODE=1 via _shared, so no email and no Shopify writes.

import { prisma, header } from "./_shared.js";
import { creditOrder } from "~/services/orders/processing.server.js";

const CLEAN = process.argv.includes("--clean");
const TAG = "RECONCILE_FIXTURE";
const ORDER_1 = `gid://shopify/Order/${TAG}-1`;
const ORDER_2 = `gid://shopify/Order/${TAG}-2`;
const ORDER_IDS = [ORDER_1, ORDER_2];
/**
 * Order 2's discount, as a fraction of the item price. Above any realistic fee
 * rate (15% here), so the WARN tier fires -- while staying a plausible
 * storefront promotion rather than a discount larger than the item.
 */
const ORDER_2_DISCOUNT_RATE = 0.25;

async function clean() {
  for (const sid of ORDER_IDS) {
    const order = await prisma.order.findUnique({ where: { shopifyId: sid }, include: { items: true } });
    if (!order) continue;
    const itemIds = order.items.map((i) => i.id);
    const txns = await prisma.transaction.findMany({
      where: { orderItemId: { in: itemIds } },
      select: { id: true },
    });
    await prisma.payoutItem.deleteMany({ where: { transactionId: { in: txns.map((t) => t.id) } } });
    await prisma.transaction.deleteMany({ where: { orderItemId: { in: itemIds } } });
    // Restore the listings this fixture consumed.
    await prisma.listing.updateMany({
      where: { id: { in: order.items.map((i) => i.listingId) } },
      data: { status: "active", soldAt: null },
    });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
  }
  const events = await prisma.webhookEvent.deleteMany({
    where: { shopifyEventId: { startsWith: TAG } },
  });
  console.log(`  removed ${ORDER_IDS.length} order(s) and ${events.count} webhook event(s)`);
}

/** The subset of an orders/create payload the reconciler reads. */
function orderCreatePayload(
  name: string,
  lines: Array<{ variantId: string; quantity: number; price: number; discount: number }>,
) {
  return {
    id: name,
    name: `#${name}`,
    // Present so the fixture resembles a real payload; the reconciler ignores
    // tax and shipping entirely and compares line items only.
    total_tax: "30.00",
    total_shipping_price_set: { shop_money: { amount: "15.00" } },
    line_items: lines.map((l) => ({
      variant_id: l.variantId.replace("gid://shopify/ProductVariant/", ""),
      quantity: l.quantity,
      price: l.price.toFixed(2),
      discount_allocations: l.discount > 0 ? [{ amount: l.discount.toFixed(2) }] : [],
    })),
  };
}

async function main() {
  header(`seed-reconcile-fixture ${CLEAN ? "(clean)" : "(create)"}`);

  // Always clean first so the fixture is idempotent.
  await clean();
  if (CLEAN) return;

  // Pick three cheap active listings on distinct variants that are linked to
  // Shopify, from non-store-owned consignors so a fee actually applies.
  const candidates = await prisma.listing.findMany({
    where: {
      status: "active",
      // Mid-priced, so a percentage discount lands on a realistic amount.
      price: { gte: 80 },
      consignor: { status: "active", storeOwned: false },
      variant: { shopifyVariantId: { not: null } },
    },
    select: {
      id: true,
      price: true,
      variantId: true,
      consignorId: true,
      consignor: { select: { name: true, feeRate: true } },
      variant: { select: { shopifyVariantId: true } },
    },
    // Secondary sort on id: price ties come back in arbitrary order otherwise,
    // so two runs can pick different consignors and the fee split stops being
    // comparable across a before/after comparison.
    orderBy: [{ price: "asc" }, { id: "asc" }],
    take: 200,
  });

  const byVariant = new Map<string, (typeof candidates)[number]>();
  for (const l of candidates) if (!byVariant.has(l.variantId)) byVariant.set(l.variantId, l);
  const picked = [...byVariant.values()].slice(0, 3);
  if (picked.length < 3) throw new Error(`need 3 distinct-variant listings, found ${picked.length}`);

  const [a, b, c] = picked;

  async function makeOrder(
    shopifyId: string,
    listings: typeof picked,
    discount: number,
  ) {
    const total = listings.reduce((s, l) => s + Number(l.price), 0);
    const order = await prisma.order.create({
      data: { shopifyId, orderNumber: `#${shopifyId}`, total, status: "open", paymentStatus: "pending" },
    });
    for (const l of listings) {
      await prisma.orderItem.create({
        data: { orderId: order.id, listingId: l.id, price: l.price! },
      });
      await prisma.listing.update({
        where: { id: l.id },
        data: { status: "pending_sale", soldAt: new Date() },
      });
    }
    // Real crediting path, so gross/fee/consignorAmount come from calculateFee.
    await creditOrder({ shopifyOrderId: shopifyId });

    await prisma.webhookEvent.create({
      data: {
        shopifyEventId: `${TAG}-${shopifyId}`,
        topic: "orders/create",
        shopifyObjectId: shopifyId,
        status: "completed",
        processedAt: new Date(),
        rawPayload: orderCreatePayload(
          shopifyId,
          listings.map((l) => ({
            variantId: l.variant.shopifyVariantId!,
            quantity: 1,
            price: Number(l.price),
            // Put the whole discount on the first line.
            discount: l === listings[0] ? discount : 0,
          })),
        ) as never,
      },
    });
    return { order, total };
  }

  const discount = Math.round(Number(c.price) * ORDER_2_DISCOUNT_RATE * 100) / 100;
  const o1 = await makeOrder(ORDER_1, [a, b], 0);
  const o2 = await makeOrder(ORDER_2, [c], discount);

  const feeOnC = Math.round(Number(c.price) * c.consignor.feeRate * 100) / 100;

  console.log(`\n  order 1 ${ORDER_1}`);
  console.log(`    ${a.consignor.name} $${a.price} + ${b.consignor.name} $${b.price} = $${o1.total}, no discount`);
  console.log(`  order 2 ${ORDER_2}`);
  console.log(`    ${c.consignor.name} $${c.price}, discount $${discount.toFixed(2)} (${ORDER_2_DISCOUNT_RATE * 100}%), store fee $${feeOnC.toFixed(2)}`);
  console.log(
    `    expect INFO (discount on consignment item)` +
      (discount > feeOnC ? ` + WARN (loss $${(discount - feeOnC).toFixed(2)})` : ""),
  );
  console.log(`\n  Both orders must reconcile to a $0.00 period delta: the ledger credits the`);
  console.log(`  listing price and the store absorbs the discount, so the comparison is against`);
  console.log(`  pre-discount line amounts.`);
  console.log(`\n  Now run: npx tsx scripts/sim/10-reconcile-shopify.ts --from=<today> --to=<today>`);
}

main()
  .catch((err) => {
    console.error("\nFATAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
