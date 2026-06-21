// Read-only data integrity audit. Exits non-zero on any failure.
//
// What it checks:
//   1. Active listings have a price > 0
//   2. No orphan listing.variantId or listing.consignorId
//   3. Variants always belong to a product
//   4. Active listings on variants without a shopifyVariantId (will never sync)
//   5. Active consignors have a non-empty email; no duplicate emails
//   6. Distinct counts: consignors / products / variants / active listings

import { prisma, check, printSummary, header } from "./_shared.js";

async function main() {
  header("scripts/sim/01-audit-data.ts");

  // ── Counts (informational, always pass) ──
  const [consignors, products, variants, activeListings] = await Promise.all([
    prisma.consignor.count(),
    prisma.product.count(),
    prisma.variant.count(),
    prisma.listing.count({ where: { status: "active" } }),
  ]);
  check({
    name: "Catalog counts",
    expected: "non-zero counts across the four core tables",
    actual: `consignors=${consignors} products=${products} variants=${variants} active_listings=${activeListings}`,
    ok: consignors > 0 && products > 0 && variants > 0 && activeListings > 0,
  });

  // ── Check 1: active listings with bad price ──
  const badPrice = await prisma.listing.findMany({
    where: { status: "active", OR: [{ price: null }, { price: { lte: 0 } }] },
    select: { id: true, price: true, consignor: { select: { name: true } } },
    take: 10,
  });
  const badPriceCount = await prisma.listing.count({
    where: { status: "active", OR: [{ price: null }, { price: { lte: 0 } }] },
  });
  check({
    name: "Active listings have price > 0",
    expected: "0 listings with null or non-positive price",
    actual: `${badPriceCount} listings`,
    ok: badPriceCount === 0,
    details: badPrice.length > 0
      ? `Sample: ${badPrice.map((l) => `${l.id} (${l.consignor.name}, $${l.price})`).join(", ")}`
      : undefined,
  });

  // ── Check 2a: orphan listing.variantId ──
  const orphanVariantIds = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT l.id FROM "Listing" l
    LEFT JOIN "Variant" v ON v.id = l."variantId"
    WHERE v.id IS NULL
    LIMIT 10
  `;
  const orphanVariantCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM "Listing" l
    LEFT JOIN "Variant" v ON v.id = l."variantId"
    WHERE v.id IS NULL
  `;
  const ovc = Number(orphanVariantCount[0].count);
  check({
    name: "Every Listing.variantId points to an existing Variant",
    expected: "0 orphan listings",
    actual: `${ovc} listings reference missing variants`,
    ok: ovc === 0,
    details: orphanVariantIds.length > 0 ? `Sample IDs: ${orphanVariantIds.map((r) => r.id).join(", ")}` : undefined,
  });

  // ── Check 2b: orphan listing.consignorId ──
  const orphanConsignorIds = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT l.id FROM "Listing" l
    LEFT JOIN "Consignor" c ON c.id = l."consignorId"
    WHERE c.id IS NULL
    LIMIT 10
  `;
  const orphanConsignorCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM "Listing" l
    LEFT JOIN "Consignor" c ON c.id = l."consignorId"
    WHERE c.id IS NULL
  `;
  const occ = Number(orphanConsignorCount[0].count);
  check({
    name: "Every Listing.consignorId points to an existing Consignor",
    expected: "0 orphan listings",
    actual: `${occ} listings reference missing consignors`,
    ok: occ === 0,
    details: orphanConsignorIds.length > 0 ? `Sample IDs: ${orphanConsignorIds.map((r) => r.id).join(", ")}` : undefined,
  });

  // ── Check 3: variant without product ──
  const orphanVarProduct = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM "Variant" v
    LEFT JOIN "Product" p ON p.id = v."productId"
    WHERE p.id IS NULL
  `;
  const ovpc = Number(orphanVarProduct[0].count);
  check({
    name: "Every Variant.productId points to an existing Product",
    expected: "0 orphan variants",
    actual: `${ovpc} variants have no parent product`,
    ok: ovpc === 0,
  });

  // ── Check 4: active listings on variants without shopifyVariantId ──
  const noSyncCount = await prisma.listing.count({
    where: { status: "active", variant: { shopifyVariantId: null } },
  });
  const noSyncSample = await prisma.listing.findMany({
    where: { status: "active", variant: { shopifyVariantId: null } },
    select: {
      id: true,
      consignor: { select: { name: true } },
      variant: { select: { size: true, product: { select: { title: true } } } },
    },
    take: 5,
  });
  check({
    name: "Active listings link to Shopify variants",
    expected: "0 active listings on variants without shopifyVariantId",
    actual: `${noSyncCount} active listings cannot sync to Shopify`,
    ok: noSyncCount === 0,
    details: noSyncSample.length > 0
      ? `Sample: ${noSyncSample.map((l) => `${l.consignor.name} - ${l.variant.product.title} (${l.variant.size})`).join("; ")}`
      : undefined,
  });

  // ── Check 5a: active consignors have email ──
  const noEmail = await prisma.consignor.count({
    where: { status: "active", OR: [{ email: "" }] },
  });
  check({
    name: "Active consignors have a non-empty email",
    expected: "0 consignors with empty email",
    actual: `${noEmail} consignors`,
    ok: noEmail === 0,
  });

  // ── Check 5b: duplicate emails (case-insensitive) ──
  const dupes = await prisma.$queryRaw<Array<{ email: string; n: bigint }>>`
    SELECT LOWER(email) as email, COUNT(*) as n
    FROM "Consignor"
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
  `;
  check({
    name: "No duplicate consignor emails (case-insensitive)",
    expected: "0 duplicates",
    actual: `${dupes.length} duplicate emails`,
    ok: dupes.length === 0,
    details: dupes.length > 0 ? `Duplicates: ${dupes.map((d) => `${d.email} (${d.n})`).join(", ")}` : undefined,
  });

  // ── Check 6: variant size is non-empty ──
  const emptySizes = await prisma.variant.count({ where: { size: "" } });
  check({
    name: "Every Variant has a non-empty size string",
    expected: "0 variants with empty size",
    actual: `${emptySizes} variants`,
    ok: emptySizes === 0,
  });

  printSummary();
}

main()
  .catch((err) => { console.error("\nFATAL:", err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
