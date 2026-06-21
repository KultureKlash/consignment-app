// Allocation determinism — predict and verify which listing wins when a sale
// or refund touches a variant with 2+ active listings.
//
// Method:
//   1. Find every variant with >=2 active listings AND non-trivial allocation
//      (>=2 consignors OR multiple prices OR ties at the same price).
//   2. For each, run BOTH:
//       - An independent TypeScript sort that mirrors the documented rule
//         (sale: price ASC, createdAt ASC | refund: price DESC, createdAt DESC).
//       - The exact SQL `ORDER BY` from app/services/orders/processing.server.ts
//         (sale) and the JS sort in app/services/orders/refunds.server.ts (refund).
//   3. Compare expected (TS) to actual (SQL/code). Mismatches = FAIL.
//   4. Print 20 sample predictions so the user can eyeball them.
//
// No writes. No Shopify calls.

import { prisma, check, printSummary, header } from "./_shared.js";

type ActiveListing = {
  id: string;
  variantId: string;
  consignorId: string;
  consignorName: string;
  price: number;
  createdAt: Date;
};

async function loadAllActiveListings(): Promise<ActiveListing[]> {
  const rows = await prisma.listing.findMany({
    where: { status: "active" },
    select: {
      id: true,
      variantId: true,
      consignorId: true,
      price: true,
      createdAt: true,
      consignor: { select: { name: true } },
    },
  });
  return rows
    .filter((r) => r.price !== null)
    .map((r) => ({
      id: r.id,
      variantId: r.variantId,
      consignorId: r.consignorId,
      consignorName: r.consignor.name,
      price: r.price as number,
      createdAt: r.createdAt,
    }));
}

type VariantGroup = {
  variantId: string;
  productTitle: string;
  size: string;
  listings: ActiveListing[];
};

async function loadVariantInfo(variantIds: string[]): Promise<Map<string, { productTitle: string; size: string }>> {
  const variants = await prisma.variant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, size: true, product: { select: { title: true } } },
  });
  const map = new Map<string, { productTitle: string; size: string }>();
  for (const v of variants) map.set(v.id, { productTitle: v.product.title, size: v.size });
  return map;
}

function expectedSaleWinner(listings: ActiveListing[]): ActiveListing {
  const sorted = [...listings].sort((a, b) => a.price - b.price || a.createdAt.getTime() - b.createdAt.getTime());
  return sorted[0];
}

function expectedRefundWinner(listings: ActiveListing[]): ActiveListing {
  const sorted = [...listings].sort((a, b) => b.price - a.price || b.createdAt.getTime() - a.createdAt.getTime());
  return sorted[0];
}

async function actualSaleWinner(variantId: string): Promise<string | null> {
  // Mirror app/services/orders/processing.server.ts allocation SQL
  // (drop FOR UPDATE since this is a read-only audit).
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Listing"
    WHERE "variantId" = ${variantId}
      AND "status" = 'active'
    ORDER BY "price" ASC, "createdAt" ASC
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

async function actualRefundWinner(variantId: string): Promise<string | null> {
  // Mirror app/services/orders/refunds.server.ts sort
  // (b.price - a.price || newer createdAt wins).
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Listing"
    WHERE "variantId" = ${variantId}
      AND "status" = 'active'
    ORDER BY "price" DESC, "createdAt" DESC
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

function ageDays(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

async function main() {
  header("scripts/sim/02-allocation.ts");

  console.log("\nLoading all active listings...");
  const allListings = await loadAllActiveListings();
  console.log(`  ${allListings.length} active listings loaded.`);

  // Group by variant
  const byVariant = new Map<string, ActiveListing[]>();
  for (const l of allListings) {
    const arr = byVariant.get(l.variantId) ?? [];
    arr.push(l);
    byVariant.set(l.variantId, arr);
  }

  // Filter to non-trivial: >=2 listings AND (>=2 consignors OR >=2 distinct prices OR ties on price)
  const nontrivial: VariantGroup[] = [];
  const variantIds: string[] = [];
  for (const [vid, list] of byVariant) {
    if (list.length < 2) continue;
    const consignors = new Set(list.map((l) => l.consignorId));
    const prices = new Set(list.map((l) => l.price));
    const tiedAtLowest = list.filter((l) => l.price === Math.min(...list.map((x) => x.price))).length >= 2;
    if (consignors.size >= 2 || prices.size >= 2 || tiedAtLowest) {
      variantIds.push(vid);
    }
  }

  const variantInfo = await loadVariantInfo(variantIds);
  for (const vid of variantIds) {
    const info = variantInfo.get(vid);
    if (!info) continue;
    nontrivial.push({
      variantId: vid,
      productTitle: info.productTitle,
      size: info.size,
      listings: byVariant.get(vid)!,
    });
  }

  console.log(`\n${nontrivial.length} non-trivial variants to verify.`);

  // ── Run predictions in batches (avoid hammering Neon) ──
  let saleMismatches = 0;
  let refundMismatches = 0;
  const mismatchSamples: string[] = [];

  for (let i = 0; i < nontrivial.length; i++) {
    const g = nontrivial[i];
    const expectedSale = expectedSaleWinner(g.listings);
    const expectedRefund = expectedRefundWinner(g.listings);
    const actualSaleId = await actualSaleWinner(g.variantId);
    const actualRefundId = await actualRefundWinner(g.variantId);

    if (actualSaleId !== expectedSale.id) {
      saleMismatches++;
      if (mismatchSamples.length < 5) {
        mismatchSamples.push(
          `Sale mismatch on ${g.productTitle} (${g.size}): expected ${expectedSale.id} (${expectedSale.consignorName} $${expectedSale.price}), got ${actualSaleId}`,
        );
      }
    }
    if (actualRefundId !== expectedRefund.id) {
      refundMismatches++;
      if (mismatchSamples.length < 10) {
        mismatchSamples.push(
          `Refund mismatch on ${g.productTitle} (${g.size}): expected ${expectedRefund.id} (${expectedRefund.consignorName} $${expectedRefund.price}), got ${actualRefundId}`,
        );
      }
    }

    if ((i + 1) % 50 === 0) process.stdout.write(`\r  verified ${i + 1}/${nontrivial.length}`);
  }
  process.stdout.write(`\r  verified ${nontrivial.length}/${nontrivial.length}\n`);

  check({
    name: "Sale allocation: TS prediction == SQL ORDER BY price ASC, createdAt ASC",
    expected: "0 mismatches",
    actual: `${saleMismatches} mismatches`,
    ok: saleMismatches === 0,
    details: mismatchSamples.filter((s) => s.startsWith("Sale")).join("\n"),
  });

  check({
    name: "Refund allocation: TS prediction == SQL ORDER BY price DESC, createdAt DESC",
    expected: "0 mismatches",
    actual: `${refundMismatches} mismatches`,
    ok: refundMismatches === 0,
    details: mismatchSamples.filter((s) => s.startsWith("Refund")).join("\n"),
  });

  // ── Show 20 sample predictions for sanity check ──
  console.log(`\n${"-".repeat(60)}\nSample predictions (20 most-contested variants):\n${"-".repeat(60)}`);
  const ranked = [...nontrivial].sort((a, b) => b.listings.length - a.listings.length).slice(0, 20);
  for (const g of ranked) {
    const sale = expectedSaleWinner(g.listings);
    const refund = expectedRefundWinner(g.listings);
    const prices = g.listings.map((l) => l.price).sort((a, b) => a - b);
    const priceStr = prices.length > 5
      ? `$${prices[0]} ... $${prices[prices.length - 1]} (${prices.length} listings)`
      : prices.map((p) => `$${p}`).join("/");
    const consignors = new Set(g.listings.map((l) => l.consignorName));
    console.log(`\n  ${g.productTitle} (size ${g.size})`);
    console.log(`    ${g.listings.length} listings across ${consignors.size} consignor(s): ${priceStr}`);
    console.log(`    SALE winner   -> ${sale.consignorName} at $${sale.price} (${ageDays(sale.createdAt)}d old, id=${sale.id})`);
    console.log(`    REFUND winner -> ${refund.consignorName} at $${refund.price} (${ageDays(refund.createdAt)}d old, id=${refund.id})`);
  }

  printSummary();
}

main()
  .catch((err) => { console.error("\nFATAL:", err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
