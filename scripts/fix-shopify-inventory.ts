/**
 * Fix Shopify inventory state after migrate-prod.ts.
 *
 * The migration created products + variants but didn't:
 *   - Enable inventory tracking on the variants  (shown as "Not tracked")
 *   - Activate inventory at the primary location
 *   - Set variant prices  (all variants are $0)
 *   - Set inventory quantities  (all 0 "in stock")
 *
 * This script reads the Neon DB to figure out the right price + quantity per
 * variant, then issues batched Shopify mutations.
 *
 * Run dry:     npx tsx scripts/fix-shopify-inventory.ts
 * Execute:     npx tsx scripts/fix-shopify-inventory.ts --go
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SHOPIFY_API_VERSION = "2024-10";
const GO = process.argv.includes("--go");
const SKIP_PHASE_1 = process.argv.includes("--skip-phase-1");

// Point at Neon prod
function loadNeonDatabaseUrl(): string {
  const envText = fs.readFileSync(path.resolve(__dirname, "../.env"), "utf8");
  const m = envText.match(/^#\s*DATABASE_URL="?(postgresql:\/\/[^"\s]+neon\.tech[^"\s]*)"?/m);
  if (!m) throw new Error("Neon DATABASE_URL not found in .env");
  return m[1];
}
process.env.DATABASE_URL = loadNeonDatabaseUrl();
const prisma = new PrismaClient();

// Shopify helpers (copied from migrate-prod.ts)
type ThrottleStatus = { currentlyAvailable: number; restoreRate: number };

async function shopifyQuery<T = any>(
  shop: string, token: string, query: string, variables?: Record<string, unknown>,
): Promise<{ data: T; throttle: ThrottleStatus | null }> {
  const endpoint = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429) {
      const retry = parseFloat(res.headers.get("retry-after") || "2");
      await new Promise((r) => setTimeout(r, retry * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Shopify HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { data: T; errors?: any[]; extensions?: any };
    if (body.errors) {
      const isThrottle = body.errors.some((e: any) => e.extensions?.code === "THROTTLED");
      if (isThrottle && attempt < 4) {
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

async function throttleWait(throttle: ThrottleStatus | null, neededCost: number) {
  if (!throttle) return;
  if (throttle.currentlyAvailable >= neededCost) return;
  const deficit = neededCost - throttle.currentlyAvailable;
  const waitMs = Math.ceil((deficit / throttle.restoreRate) * 1000) + 100;
  await new Promise((r) => setTimeout(r, waitMs));
}

async function main() {
  console.log(`\n=== fix-shopify-inventory.ts — ${GO ? "EXECUTE" : "DRY RUN"} ===\n`);

  const session = await prisma.session.findFirst({ where: { accessToken: { not: "" } } });
  if (!session) throw new Error("No Session in Neon");
  console.log(`Shop: ${session.shop}`);

  // Get primary location
  const locResp = await shopifyQuery<any>(session.shop, session.accessToken,
    `query { locations(first: 1) { nodes { id name } } }`);
  const locationId = locResp.data.locations.nodes[0].id;
  console.log(`Primary location: ${locResp.data.locations.nodes[0].name} (${locationId})`);

  // Pull all products + their variants from Neon, grouped by productId
  const products = await prisma.product.findMany({
    where: { shopifyProductId: { not: null } },
    include: {
      variants: {
        where: { shopifyVariantId: { not: null } },
      },
    },
  });
  console.log(`Found ${products.length} products in Neon with ${products.reduce((n, p) => n + p.variants.length, 0)} linked variants`);

  // For each variant, compute lowest active price + count at lowest price
  const variantStats = new Map<string, { price: number | null; count: number }>();
  for (const p of products) {
    for (const v of p.variants) {
      const lowest = await prisma.listing.findFirst({
        where: { variantId: v.id, status: "active" },
        orderBy: { price: "asc" },
        select: { price: true },
      });
      if (!lowest || lowest.price === null) {
        variantStats.set(v.id, { price: null, count: 0 });
      } else {
        const count = await prisma.listing.count({
          where: { variantId: v.id, status: "active", price: lowest.price },
        });
        variantStats.set(v.id, { price: lowest.price, count });
      }
    }
  }

  const withInventory = [...variantStats.values()].filter((s) => s.count > 0).length;
  console.log(`Variants with active listings: ${withInventory}`);

  if (!GO) {
    console.log("\nDRY RUN — exiting. Re-run with --go to actually update Shopify.\n");
    return;
  }

  // Phase 1: productVariantsBulkUpdate per product — sets price + enables tracking
  let throttle: ThrottleStatus | null = null;
  let processedProducts = 0;

  if (SKIP_PHASE_1) {
    console.log(`\n[phase 1] SKIPPED (--skip-phase-1)`);
  } else {
  console.log(`\n[phase 1] Enabling tracking + setting prices (per product bulk update)...`);

  for (const p of products) {
    if (p.variants.length === 0) continue;
    const variantInputs = p.variants.map((v) => {
      const stats = variantStats.get(v.id);
      const input: Record<string, unknown> = {
        id: v.shopifyVariantId!,
        inventoryItem: { tracked: true },
      };
      if (stats?.price != null) input.price = stats.price.toFixed(2);
      return input;
    });

    await throttleWait(throttle, 30);
    try {
      const resp = await shopifyQuery<any>(session.shop, session.accessToken,
        `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id }
            userErrors { field message }
          }
        }`,
        { productId: p.shopifyProductId!, variants: variantInputs },
      );
      throttle = resp.throttle;
      const errs = resp.data.productVariantsBulkUpdate.userErrors;
      if (errs.length > 0) {
        console.error(`\n  [${p.shopifyProductId}] ${errs[0].message}`);
      }
    } catch (err) {
      console.error(`\n  [${p.shopifyProductId}] ${err instanceof Error ? err.message : String(err)}`);
    }
    processedProducts++;
    if (processedProducts % 25 === 0) process.stdout.write(`\r  ${processedProducts}/${products.length} products updated`);
  }
  process.stdout.write("\n");
  }

  // Phase 2: Activate inventory + set quantities for variants with listings
  console.log(`\n[phase 2] Activating inventory + setting quantities for ${withInventory} variants...`);

  const variantsWithListings: Array<{ inventoryItemId: string; quantity: number; variantId: string }> = [];
  for (const p of products) {
    for (const v of p.variants) {
      const stats = variantStats.get(v.id);
      if (!stats || stats.count === 0) continue;
      if (!v.inventoryItemId) continue;
      variantsWithListings.push({ inventoryItemId: v.inventoryItemId, quantity: stats.count, variantId: v.shopifyVariantId! });
    }
  }

  let activated = 0;
  let activateFailed = 0;
  for (const v of variantsWithListings) {
    await throttleWait(throttle, 15);
    try {
      const resp = await shopifyQuery<any>(session.shop, session.accessToken,
        `mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
          inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
            inventoryLevel { id }
            userErrors { field message }
          }
        }`,
        { inventoryItemId: v.inventoryItemId, locationId },
      );
      throttle = resp.throttle;
      activated++;
    } catch (err) {
      activateFailed++;
    }
    if ((activated + activateFailed) % 50 === 0) {
      process.stdout.write(`\r  activated ${activated}, failed ${activateFailed} of ${variantsWithListings.length}`);
    }
  }
  process.stdout.write("\n");

  // Phase 3: Set quantities in batches (max 100 per call)
  console.log(`\n[phase 3] Setting quantities in batches of 100...`);
  let qtyBatches = 0;
  let qtyFailed = 0;
  for (let i = 0; i < variantsWithListings.length; i += 100) {
    const batch = variantsWithListings.slice(i, i + 100);
    await throttleWait(throttle, 50);
    try {
      const resp = await shopifyQuery<any>(session.shop, session.accessToken,
        `mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            inventoryAdjustmentGroup { reason }
            userErrors { field message }
          }
        }`,
        {
          input: {
            name: "available",
            reason: "correction",
            ignoreCompareQuantity: true,
            quantities: batch.map((b) => ({
              inventoryItemId: b.inventoryItemId,
              locationId,
              quantity: b.quantity,
            })),
          },
        },
      );
      throttle = resp.throttle;
      const errs = resp.data.inventorySetQuantities.userErrors;
      if (errs.length > 0) {
        console.error(`  batch ${qtyBatches}: ${errs[0].message}`);
        qtyFailed++;
      }
    } catch (err) {
      console.error(`  batch ${qtyBatches}: ${err instanceof Error ? err.message : String(err)}`);
      qtyFailed++;
    }
    qtyBatches++;
    process.stdout.write(`\r  batch ${qtyBatches} of ${Math.ceil(variantsWithListings.length / 100)}`);
  }
  process.stdout.write("\n");

  console.log(`\n=== DONE ===`);
  console.log(`  Products updated:       ${processedProducts}`);
  console.log(`  Inventory activated:    ${activated} (${activateFailed} failed)`);
  console.log(`  Quantity batches:       ${qtyBatches} (${qtyFailed} failed)`);
}

main()
  .catch((err) => { console.error("\nFATAL:", err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
