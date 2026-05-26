/**
 * Smarter v2 of fix-shopify-inventory.ts:
 *   - Batched Neon queries (one groupBy instead of 23k findFirsts) — data
 *     load drops from ~10 min to ~2 sec.
 *   - Resumable: writes progress to scripts/fix-inventory-checkpoint.json
 *     after every product. On 401, saves progress and exits cleanly so we
 *     can resume after refreshing the token.
 *
 * Run dry:     npx tsx scripts/fix-shopify-inventory-v2.ts
 * Execute:     npx tsx scripts/fix-shopify-inventory-v2.ts --go
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SHOPIFY_API_VERSION = "2024-10";
const GO = process.argv.includes("--go");
const RESET_CHECKPOINT = process.argv.includes("--reset");
const CHECKPOINT_FILE = path.resolve(__dirname, "fix-inventory-checkpoint.json");

function loadNeonDatabaseUrl(): string {
  const envText = fs.readFileSync(path.resolve(__dirname, "../.env"), "utf8");
  const m = envText.match(/^#\s*DATABASE_URL="?(postgresql:\/\/[^"\s]+neon\.tech[^"\s]*)"?/m);
  if (!m) throw new Error("Neon DATABASE_URL not found");
  return m[1];
}
process.env.DATABASE_URL = loadNeonDatabaseUrl();
const prisma = new PrismaClient();

type ThrottleStatus = { currentlyAvailable: number; restoreRate: number };

class TokenExpired extends Error {
  constructor() { super("Shopify token expired (401)"); }
}

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

async function throttleWait(throttle: ThrottleStatus | null, neededCost: number) {
  if (!throttle) return;
  if (throttle.currentlyAvailable >= neededCost) return;
  const deficit = neededCost - throttle.currentlyAvailable;
  const waitMs = Math.ceil((deficit / throttle.restoreRate) * 1000) + 100;
  await new Promise((r) => setTimeout(r, waitMs));
}

type Checkpoint = {
  phase1Done: string[];  // product IDs done in phase 1
  phase2Done: string[];  // inventory item IDs activated in phase 2
  phase3Done: string[];  // batch indices done in phase 3
};
function loadCheckpoint(): Checkpoint {
  if (RESET_CHECKPOINT || !fs.existsSync(CHECKPOINT_FILE)) {
    return { phase1Done: [], phase2Done: [], phase3Done: [] };
  }
  return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf8"));
}
function saveCheckpoint(cp: Checkpoint) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

async function main() {
  console.log(`\n=== fix-shopify-inventory-v2.ts — ${GO ? "EXECUTE" : "DRY RUN"} ===\n`);

  const session = await prisma.session.findFirst({ where: { accessToken: { not: "" } } });
  if (!session) throw new Error("No session in Neon");
  console.log(`Shop: ${session.shop}`);

  const locResp = await shopifyQuery<any>(session.shop, session.accessToken,
    `query { locations(first: 1) { nodes { id name } } }`);
  const locationId = locResp.data.locations.nodes[0].id;
  console.log(`Location: ${locResp.data.locations.nodes[0].name}`);

  // ── Batched Neon data load ──
  console.log(`\nLoading variant stats from Neon (batched)...`);
  const t0 = Date.now();

  // Step 1: all variants with their product's Shopify ID
  const variants = await prisma.variant.findMany({
    where: { shopifyVariantId: { not: null } },
    select: {
      id: true,
      size: true,
      shopifyVariantId: true,
      inventoryItemId: true,
      productId: true,
      product: { select: { shopifyProductId: true } },
    },
  });

  // Step 2: groupBy listings to get count per variant
  const counts = await prisma.listing.groupBy({
    by: ["variantId", "price"],
    where: { status: "active", price: { not: null } },
    _count: { _all: true },
  });

  // Build variantId → [{price, count}] map, then keep lowest-price entry
  const variantToOffers = new Map<string, { price: number; count: number }>();
  for (const c of counts) {
    if (c.price == null) continue;
    const existing = variantToOffers.get(c.variantId);
    if (!existing || c.price < existing.price) {
      variantToOffers.set(c.variantId, { price: c.price, count: c._count._all });
    }
  }

  // Group variants by product
  const productMap = new Map<string, { shopifyProductId: string; variants: typeof variants }>();
  for (const v of variants) {
    if (!v.product.shopifyProductId) continue;
    const key = v.product.shopifyProductId;
    const existing = productMap.get(key) ?? { shopifyProductId: key, variants: [] };
    existing.variants.push(v);
    productMap.set(key, existing);
  }

  const variantsWithListings = variants.filter((v) => variantToOffers.has(v.id));
  console.log(`  Loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  ${productMap.size} products, ${variants.length} variants, ${variantsWithListings.length} with active listings`);

  if (!GO) {
    console.log(`\nDRY RUN — exiting. Re-run with --go.\n`);
    return;
  }

  const cp = loadCheckpoint();
  const phase1Done = new Set(cp.phase1Done);
  const phase2Done = new Set(cp.phase2Done);
  const phase3Done = new Set(cp.phase3Done);
  console.log(`\nCheckpoint: phase1=${phase1Done.size} phase2=${phase2Done.size} phase3=${phase3Done.size} done.`);

  let throttle: ThrottleStatus | null = null;

  // ── Phase 1: enable tracking + set price per product ──
  console.log(`\n[phase 1] Tracking + price for ${productMap.size} products...`);
  let p1Done = 0;
  try {
    for (const [shopifyProductId, p] of productMap) {
      if (phase1Done.has(shopifyProductId)) { p1Done++; continue; }
      const variantInputs = p.variants.map((v) => {
        const stats = variantToOffers.get(v.id);
        const input: Record<string, unknown> = {
          id: v.shopifyVariantId!,
          inventoryItem: { tracked: true },
        };
        if (stats) input.price = stats.price.toFixed(2);
        return input;
      });

      await throttleWait(throttle, 30);
      const resp = await shopifyQuery<any>(session.shop, session.accessToken,
        `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id }
            userErrors { field message }
          }
        }`,
        { productId: shopifyProductId, variants: variantInputs },
      );
      throttle = resp.throttle;
      const errs = resp.data.productVariantsBulkUpdate.userErrors;
      if (errs.length > 0) console.error(`\n  [${shopifyProductId}] ${errs[0].message}`);
      phase1Done.add(shopifyProductId);
      cp.phase1Done = [...phase1Done];
      p1Done++;
      if (p1Done % 10 === 0) saveCheckpoint(cp);
      if (p1Done % 25 === 0) process.stdout.write(`\r  ${p1Done}/${productMap.size}`);
    }
    process.stdout.write("\n");
  } catch (err) {
    saveCheckpoint(cp);
    if (err instanceof TokenExpired) {
      console.error(`\n[phase 1] TOKEN EXPIRED at ${p1Done}/${productMap.size}. Saved checkpoint.`);
      console.error(`Refresh token by re-opening Konsign in admin, then re-run this same command to resume.`);
      process.exit(2);
    }
    throw err;
  }
  saveCheckpoint(cp);

  // ── Phase 2: activate inventory for variants with listings ──
  console.log(`\n[phase 2] Activate ${variantsWithListings.length} variants...`);
  let p2Done = 0;
  try {
    for (const v of variantsWithListings) {
      if (!v.inventoryItemId) { p2Done++; continue; }
      if (phase2Done.has(v.inventoryItemId)) { p2Done++; continue; }

      await throttleWait(throttle, 15);
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
      phase2Done.add(v.inventoryItemId);
      cp.phase2Done = [...phase2Done];
      p2Done++;
      if (p2Done % 25 === 0) { saveCheckpoint(cp); process.stdout.write(`\r  ${p2Done}/${variantsWithListings.length}`); }
    }
    process.stdout.write("\n");
  } catch (err) {
    saveCheckpoint(cp);
    if (err instanceof TokenExpired) {
      console.error(`\n[phase 2] TOKEN EXPIRED at ${p2Done}/${variantsWithListings.length}. Resume by re-running.`);
      process.exit(2);
    }
    throw err;
  }
  saveCheckpoint(cp);

  // ── Phase 3: set quantities in batches of 100 ──
  console.log(`\n[phase 3] Set quantities in batches of 100...`);
  const totalBatches = Math.ceil(variantsWithListings.length / 100);
  try {
    for (let i = 0; i < variantsWithListings.length; i += 100) {
      const batchKey = `batch_${i}`;
      if (phase3Done.has(batchKey)) continue;

      const batch = variantsWithListings.slice(i, i + 100).filter((v) => v.inventoryItemId);
      const quantities = batch.map((v) => ({
        inventoryItemId: v.inventoryItemId!,
        locationId,
        quantity: variantToOffers.get(v.id)!.count,
      }));

      await throttleWait(throttle, 50);
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
            quantities,
          },
        },
      );
      throttle = resp.throttle;
      const errs = resp.data.inventorySetQuantities.userErrors;
      if (errs.length > 0) console.error(`\n  batch_${i}: ${errs[0].message}`);
      phase3Done.add(batchKey);
      cp.phase3Done = [...phase3Done];
      saveCheckpoint(cp);
      process.stdout.write(`\r  batch ${Math.floor(i / 100) + 1}/${totalBatches}`);
    }
    process.stdout.write("\n");
  } catch (err) {
    saveCheckpoint(cp);
    if (err instanceof TokenExpired) {
      console.error(`\n[phase 3] TOKEN EXPIRED. Resume by re-running.`);
      process.exit(2);
    }
    throw err;
  }

  console.log(`\n=== DONE ===`);
  console.log(`  Phase 1 (tracking+price): ${phase1Done.size}/${productMap.size}`);
  console.log(`  Phase 2 (activate):       ${phase2Done.size}/${variantsWithListings.length}`);
  console.log(`  Phase 3 (set qty):        ${phase3Done.size}/${totalBatches} batches`);
}

main()
  .catch((err) => { console.error("\nFATAL:", err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
