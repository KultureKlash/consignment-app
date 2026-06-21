// Inventory parity audit: for every Neon variant with a shopifyVariantId, compare
//   - Expected quantity = count(active listings at the variant's lowest active price)
//   - Actual quantity   = Shopify inventoryLevel for the primary location
//
// Read-only on both sides. Token rotates frequently — script exits with a clear
// "refresh and retry" message on 401 instead of hammering.

import { prisma, check, printSummary, header } from "./_shared.js";

const SHOPIFY_API_VERSION = "2024-10";

type ThrottleStatus = { currentlyAvailable: number; restoreRate: number };
class TokenExpired extends Error { constructor() { super("Shopify token 401"); } }

async function shopifyQuery<T = any>(
  shop: string, token: string, query: string, variables?: Record<string, unknown>,
): Promise<{ data: T; throttle: ThrottleStatus | null }> {
  const endpoint = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401) throw new TokenExpired();
    if (res.status === 429) {
      const retry = parseFloat(res.headers.get("retry-after") || "2");
      await new Promise((r) => setTimeout(r, retry * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Shopify HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { data: T; errors?: any[]; extensions?: any };
    if (body.errors) {
      const isThrottle = body.errors.some((e: any) => e.extensions?.code === "THROTTLED");
      if (isThrottle && attempt < 2) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw new Error(`Shopify GraphQL errors: ${JSON.stringify(body.errors)}`);
    }
    const throttle: ThrottleStatus | null = body.extensions?.cost?.throttleStatus ?? null;
    return { data: body.data, throttle };
  }
  throw new Error("Shopify GraphQL: exceeded retries");
}

async function throttleWait(t: ThrottleStatus | null, cost: number) {
  if (!t) return;
  if (t.currentlyAvailable >= cost) return;
  const waitMs = Math.ceil(((cost - t.currentlyAvailable) / t.restoreRate) * 1000) + 100;
  await new Promise((r) => setTimeout(r, waitMs));
}

async function main() {
  header("scripts/sim/04-inventory-parity.ts");

  const session = await prisma.session.findFirst({ where: { accessToken: { not: "" } } });
  if (!session) { console.error("No Shopify session"); process.exit(1); }

  // Get primary location
  let throttle: ThrottleStatus | null = null;
  try {
    const locResp = await shopifyQuery<any>(session.shop, session.accessToken,
      `query { locations(first: 1) { nodes { id name } } }`);
    throttle = locResp.throttle;
    console.log(`\nShop: ${session.shop}`);
    console.log(`Location: ${locResp.data.locations.nodes[0].name}`);
  } catch (err) {
    if (err instanceof TokenExpired) {
      console.error("\nShopify token expired. Refresh by opening the Konsign app in admin, then re-run.");
      process.exit(2);
    }
    throw err;
  }
  const locationId = (await shopifyQuery<any>(session.shop, session.accessToken,
    `query { locations(first: 1) { nodes { id } } }`)).data.locations.nodes[0].id;

  // Load all linked variants from Neon + compute expected quantities
  console.log(`\nLoading expected quantities from Neon...`);
  const t0 = Date.now();

  const variants = await prisma.variant.findMany({
    where: { shopifyVariantId: { not: null }, inventoryItemId: { not: null } },
    select: {
      id: true,
      shopifyVariantId: true,
      inventoryItemId: true,
      product: { select: { title: true } },
      size: true,
    },
  });

  const counts = await prisma.listing.groupBy({
    by: ["variantId", "price"],
    where: { status: "active", price: { not: null } },
    _count: { _all: true },
  });
  const variantToExpected = new Map<string, number>();
  for (const c of counts) {
    if (c.price == null) continue;
    const existing = variantToExpected.get(c.variantId);
    if (existing === undefined) {
      variantToExpected.set(c.variantId, c._count._all);
    } else {
      // Need to know if this is the lowest price for the variant
      // Re-walk: store {price, count} pairs and pick min later
    }
  }
  // Re-do with proper logic: find lowest price per variant, then count at that price.
  const lowestByVariant = new Map<string, { price: number; count: number }>();
  for (const c of counts) {
    if (c.price == null) continue;
    const existing = lowestByVariant.get(c.variantId);
    if (!existing || c.price < existing.price) {
      lowestByVariant.set(c.variantId, { price: c.price, count: c._count._all });
    }
  }
  // Variants with no active listings → expected qty 0
  console.log(`  Loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  console.log(`  ${variants.length} linked variants, ${lowestByVariant.size} with active listings.`);

  // Map inventoryItemId -> { variantId, productTitle, size, expectedQty }
  const itemToExpected = new Map<string, { variantId: string; productTitle: string; size: string; expectedQty: number }>();
  for (const v of variants) {
    const stats = lowestByVariant.get(v.id);
    itemToExpected.set(v.inventoryItemId!, {
      variantId: v.id,
      productTitle: v.product.title,
      size: v.size,
      expectedQty: stats?.count ?? 0,
    });
  }

  // Pull Shopify inventory levels in batches of 100 via inventoryItems query
  console.log(`\nFetching Shopify inventory levels...`);
  const allItemIds = [...itemToExpected.keys()];
  const mismatches: Array<{ productTitle: string; size: string; expected: number; actual: number }> = [];
  let okCount = 0;

  // The bulk inventoryItems query allows us to ask for many items at once.
  for (let i = 0; i < allItemIds.length; i += 100) {
    const batch = allItemIds.slice(i, i + 100);
    const filter = batch.map((id) => `id:${id.split("/").pop()}`).join(" OR ");
    await throttleWait(throttle, 30);
    try {
      const resp = await shopifyQuery<any>(session.shop, session.accessToken, `
        query inventoryItems($q: String!, $loc: ID!) {
          inventoryItems(first: 100, query: $q) {
            nodes {
              id
              inventoryLevel(locationId: $loc) { quantities(names: ["available"]) { name quantity } }
            }
          }
        }
      `, { q: filter, loc: locationId });
      throttle = resp.throttle;
      const nodes = resp.data.inventoryItems.nodes as Array<any>;
      for (const n of nodes) {
        const expected = itemToExpected.get(n.id);
        if (!expected) continue;
        const qty = n.inventoryLevel?.quantities?.[0]?.quantity ?? 0;
        if (qty === expected.expectedQty) {
          okCount++;
        } else {
          mismatches.push({
            productTitle: expected.productTitle,
            size: expected.size,
            expected: expected.expectedQty,
            actual: qty,
          });
        }
      }
    } catch (err) {
      if (err instanceof TokenExpired) {
        console.error("\nToken expired mid-run. Refresh and re-run.");
        process.exit(2);
      }
      throw err;
    }
    process.stdout.write(`\r  checked ${Math.min(i + 100, allItemIds.length)}/${allItemIds.length} (OK=${okCount}, mismatched=${mismatches.length})`);
  }
  process.stdout.write("\n");

  check({
    name: "Every Neon variant's expected qty matches Shopify inventory at primary location",
    expected: `${allItemIds.length} variants in parity`,
    actual: `${okCount} OK, ${mismatches.length} mismatched`,
    ok: mismatches.length === 0,
    details: mismatches.slice(0, 20)
      .map((m) => `  ${m.productTitle} (${m.size}): expected=${m.expected}, actual=${m.actual}, diff=${m.actual - m.expected}`)
      .join("\n"),
  });

  printSummary();
}

main()
  .catch((err) => { console.error("\nFATAL:", err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
