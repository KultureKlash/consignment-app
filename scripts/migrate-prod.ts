/**
 * Wipe Neon prod + Shopify dev store and re-import real Laravel data.
 *
 * What it does (in order, when run with --go):
 *   1. Read offline Shopify access token from the Neon `Session` table.
 *   2. SAFETY: refuse to delete unless shop domain contains "dev" or "test".
 *   3. Parse the Laravel SQL dump (database export real data.sql).
 *   4. Filter to products that have ACTIVE listings (qty > 0, price > 0).
 *   5. WIPE Shopify dev store: delete every product via productDelete.
 *   6. RECREATE Shopify products: for each active product, productCreate +
 *      productVariantsBulkCreate using data from the dump. Records new
 *      shopify product/variant IDs to a checkpoint file so we can resume.
 *   7. TRUNCATE every Neon domain table (keeps Session intact).
 *   8. Import 19 consignors with tax/store-owned/Quebec-Ontario flags.
 *   9. Import 1,694 active listings, each expanded into per-item Listing rows,
 *      linked to the new Shopify variant IDs.
 *
 * Orders / transactions / payouts are NOT imported — clean slate so we can
 * test the full sale-to-payout flow from zero.
 *
 * Flags:
 *   --go              actually run (default is dry-run)
 *   --skip-wipe-shopify     reuse existing Shopify state (do not delete)
 *   --skip-recreate-shopify use checkpoint file from a previous successful run
 *   --skip-wipe-neon  keep current Neon state
 *
 * Run dry:     npx tsx scripts/migrate-prod.ts
 * Execute:     npx tsx scripts/migrate-prod.ts --go
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Partner's hardcoded mappings from app.seed-migration.tsx ──
const STORE_OWNED_IDS = new Set(["27", "41", "44", "49"]);
const MERGE_RETAILER: Record<string, string> = { "41": "44" };
const EMAIL_OVERRIDES: Record<string, string> = {
  "36": "meryachkanou@gmail.com",
  "42": "shopkultureklash@gmail.com",
  "49": "support@shopkultureklash.com",
  "47": "laceup@placeholder.com",
  "50": "mike15@placeholder.com",
};
const BUSINESS_CONSIGNORS = new Set(["13", "15", "16", "18", "23", "25", "30", "35", "46", "47", "50"]);
const ONTARIO_CONSIGNORS = new Set(["25"]);

const DUMP_FILENAME = "database export real data.sql";
const SHOPIFY_API_VERSION = "2024-10";
const CHECKPOINT_FILE = path.resolve(__dirname, "../scripts/migrate-checkpoint.json");

const GO = process.argv.includes("--go");
const SKIP_WIPE_SHOPIFY = process.argv.includes("--skip-wipe-shopify");
const SKIP_RECREATE_SHOPIFY = process.argv.includes("--skip-recreate-shopify");
const SKIP_WIPE_NEON = process.argv.includes("--skip-wipe-neon");

// ── DB URL: point at Neon prod (uncomment the commented-out line in .env) ──
function loadNeonDatabaseUrl(): string {
  const envText = fs.readFileSync(path.resolve(__dirname, "../.env"), "utf8");
  const m = envText.match(/^#\s*DATABASE_URL="?(postgresql:\/\/[^"\s]+neon\.tech[^"\s]*)"?/m);
  if (!m) throw new Error("Neon DATABASE_URL not found (commented postgresql://...neon.tech line in .env)");
  return m[1];
}

process.env.DATABASE_URL = loadNeonDatabaseUrl();
const prisma = new PrismaClient();

// ── SQL parser (from app/routes/app.seed-migration.tsx) ──
function parseInsert(sql: string, table: string, columns: string[]): Array<Record<string, string>> {
  const regex = new RegExp(`INSERT INTO \\\`${table}\\\`[^)]*\\)\\s*VALUES\\s*`, "g");
  let allValuesStr = "";
  let match;
  while ((match = regex.exec(sql)) !== null) {
    const startIdx = match.index + match[0].length;
    const endIdx = sql.indexOf(";\n", startIdx);
    const chunk = sql.substring(startIdx, endIdx === -1 ? undefined : endIdx);
    allValuesStr += (allValuesStr ? "," : "") + chunk;
  }
  if (!allValuesStr) return [];

  const rows: Array<Record<string, string>> = [];
  let depth = 0;
  let current = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < allValuesStr.length; i++) {
    const ch = allValuesStr[i];
    if (escape) { current += ch; escape = false; continue; }
    if (ch === "\\") { current += ch; escape = true; continue; }
    if (ch === "'" && !escape) { inString = !inString; current += ch; continue; }
    if (inString) { current += ch; continue; }
    if (ch === "(") { if (depth === 0) current = ""; else current += ch; depth++; continue; }
    if (ch === ")") {
      depth--;
      if (depth === 0) {
        const values = parseRow(current);
        const row: Record<string, string> = {};
        for (let j = 0; j < columns.length && j < values.length; j++) row[columns[j]] = values[j];
        rows.push(row);
      } else current += ch;
      continue;
    }
    if (depth > 0) current += ch;
  }
  return rows;
}

function parseRow(raw: string): string[] {
  const values: string[] = [];
  let current = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { current += ch; escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === "'") { inString = !inString; continue; }
    if (ch === "," && !inString) { values.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  values.push(current.trim());
  return values.map((v) => (v === "NULL" ? "" : v));
}

// ── Shopify GraphQL via raw fetch ──
type ThrottleStatus = { currentlyAvailable: number; restoreRate: number };

async function shopifyQuery<T = any>(
  shop: string,
  token: string,
  query: string,
  variables?: Record<string, unknown>,
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

// ── Phase 1: Wipe Shopify products (dev only) ──
async function wipeShopifyProducts(shop: string, token: string) {
  if (!/dev|test|staging/i.test(shop)) {
    throw new Error(`SAFETY: shop "${shop}" doesn't look like a dev store. Refusing to delete products.`);
  }

  console.log(`\n[wipe-shopify] Fetching all product IDs from ${shop}...`);
  const ids: string[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  let lastThrottle: ThrottleStatus | null = null;

  while (hasNext) {
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const { data, throttle } = await shopifyQuery<any>(
      shop, token,
      `query { products(first: 250${afterClause}) { pageInfo { hasNextPage endCursor } nodes { id } } }`,
    );
    for (const p of data.products.nodes) ids.push(p.id);
    hasNext = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
    lastThrottle = throttle;
    process.stdout.write(`\r  collected ${ids.length} product IDs`);
  }
  process.stdout.write("\n");
  console.log(`[wipe-shopify] ${ids.length} products to delete.`);

  let deleted = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await throttleWait(lastThrottle, 30);
      const { data, throttle } = await shopifyQuery<any>(
        shop, token,
        `mutation productDelete($input: ProductDeleteInput!) {
          productDelete(input: $input) { deletedProductId userErrors { field message } }
        }`,
        { input: { id } },
      );
      lastThrottle = throttle;
      if (data.productDelete.userErrors.length > 0) {
        failed++;
      } else {
        deleted++;
      }
    } catch (err) {
      failed++;
    }
    if (deleted % 25 === 0 || (deleted + failed) === ids.length) {
      process.stdout.write(`\r  deleted ${deleted}, failed ${failed} of ${ids.length}`);
    }
  }
  process.stdout.write("\n");
  console.log(`[wipe-shopify] Done. deleted=${deleted} failed=${failed}`);
}

// ── Phase 2: Recreate Shopify products from dump ──
type DumpProduct = Record<string, string>;
type DumpVariant = Record<string, string>;
type NewVariantInfo = { newVariantId: string; inventoryItemId: string };
type RecreateCheckpoint = {
  productOldToNewId: Record<string, string>;    // old shopify product id → new
  variantOldToNew: Record<string, NewVariantInfo>; // old shopify variant id → new variant info
};

function saveCheckpoint(cp: RecreateCheckpoint) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

function loadCheckpoint(): RecreateCheckpoint | null {
  if (!fs.existsSync(CHECKPOINT_FILE)) return null;
  return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf8"));
}

async function recreateShopifyProducts(
  shop: string,
  token: string,
  activeProducts: DumpProduct[],
  variantsByProductId: Map<string, DumpVariant[]>,
): Promise<RecreateCheckpoint> {
  const cp: RecreateCheckpoint = loadCheckpoint() ?? { productOldToNewId: {}, variantOldToNew: {} };
  const alreadyDone = new Set(Object.keys(cp.productOldToNewId));

  console.log(`\n[recreate-shopify] ${activeProducts.length} products to create (${alreadyDone.size} already done in checkpoint).`);

  let lastThrottle: ThrottleStatus | null = null;
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < activeProducts.length; i++) {
    const p = activeProducts[i];
    if (alreadyDone.has(p.id)) { skipped++; continue; }

    const productVariants = variantsByProductId.get(p.id) ?? [];
    // De-duplicate sizes (Shopify rejects duplicate option values).
    const seenSizes = new Set<string>();
    const uniqueVariants = productVariants.filter((v) => {
      if (!v.title || seenSizes.has(v.title)) return false;
      seenSizes.add(v.title);
      return true;
    });
    if (uniqueVariants.length === 0) { skipped++; continue; }

    try {
      await throttleWait(lastThrottle, 50);

      // 1. productCreate with first variant + image
      const firstVariant = uniqueVariants[0];
      const productInput: Record<string, unknown> = {
        title: p.title,
        status: "ACTIVE",
        productOptions: [{ name: "Size", values: [{ name: firstVariant.title }] }],
      };
      if (p.vendor) productInput.vendor = p.vendor;

      const media = p.image ? [{ originalSource: p.image, mediaContentType: "IMAGE" }] : undefined;

      const createResp = await shopifyQuery<any>(
        shop, token,
        `mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
          productCreate(product: $product, media: $media) {
            product {
              id
              variants(first: 1) { nodes { id title inventoryItem { id } } }
            }
            userErrors { field message }
          }
        }`,
        { product: productInput, ...(media ? { media } : {}) },
      );
      lastThrottle = createResp.throttle;

      const errs = createResp.data.productCreate.userErrors;
      if (errs.length > 0) {
        failed++;
        console.error(`\n  [${p.id}] productCreate error: ${errs[0].message}`);
        continue;
      }

      const newProduct = createResp.data.productCreate.product;
      cp.productOldToNewId[p.id] = newProduct.id;
      const firstNew = newProduct.variants.nodes[0];
      cp.variantOldToNew[firstVariant.id] = {
        newVariantId: firstNew.id,
        inventoryItemId: firstNew.inventoryItem.id,
      };

      // 2. Add remaining variants via productVariantsBulkCreate
      if (uniqueVariants.length > 1) {
        const remaining = uniqueVariants.slice(1);
        await throttleWait(lastThrottle, 50);
        const bulkResp = await shopifyQuery<any>(
          shop, token,
          `mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkCreate(productId: $productId, variants: $variants) {
              productVariants { id title inventoryItem { id } }
              userErrors { field message }
            }
          }`,
          {
            productId: newProduct.id,
            variants: remaining.map((v) => ({
              optionValues: [{ optionName: "Size", name: v.title }],
            })),
          },
        );
        lastThrottle = bulkResp.throttle;
        const bulkErrs = bulkResp.data.productVariantsBulkCreate.userErrors;
        if (bulkErrs.length > 0) {
          console.error(`\n  [${p.id}] bulkCreate partial: ${bulkErrs[0].message}`);
        }
        const newVariants = bulkResp.data.productVariantsBulkCreate.productVariants;
        for (let k = 0; k < remaining.length && k < newVariants.length; k++) {
          cp.variantOldToNew[remaining[k].id] = {
            newVariantId: newVariants[k].id,
            inventoryItemId: newVariants[k].inventoryItem.id,
          };
        }
      }

      created++;
      if (created % 10 === 0) saveCheckpoint(cp);
      if ((created + skipped + failed) % 25 === 0 || i === activeProducts.length - 1) {
        process.stdout.write(`\r  progress ${i + 1}/${activeProducts.length} (created ${created}, skipped ${skipped}, failed ${failed})`);
      }
    } catch (err) {
      failed++;
      console.error(`\n  [${p.id}] ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  process.stdout.write("\n");

  saveCheckpoint(cp);
  console.log(`[recreate-shopify] Done. created=${created} skipped=${skipped} failed=${failed}`);
  console.log(`[recreate-shopify] Variant ID mappings: ${Object.keys(cp.variantOldToNew).length}`);
  return cp;
}

// ── Phase 3: Wipe Neon ──
async function wipeNeon() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "PayoutItem", "Payout", "Transaction", "OrderItem", "Order",
      "Listing", "Variant", "Product", "StoreSection", "Consignor",
      "WebhookEvent", "OtpCode", "Feedback", "ReassignmentLog"
    RESTART IDENTITY CASCADE
  `);
}

// ── Main ──
async function main() {
  const mode = GO ? "EXECUTE (writes to Neon + Shopify dev!)" : "DRY RUN — no writes";
  console.log(`\n=== migrate-prod.ts — ${mode} ===\n`);

  // 1. Read Session for Shopify creds
  const session = await prisma.session.findFirst({ where: { accessToken: { not: "" } } });
  if (!session) throw new Error("No Session in Neon — cannot call Shopify.");
  console.log(`Session: shop=${session.shop}`);
  console.log(`  Session expires field: ${session.expires?.toISOString() ?? "(never)"} — note: offline sessions still work past this.`);

  // Live ping the Shopify API to verify the token is actually valid
  // (the `expires` field is misleading for offline sessions).
  const ping = await shopifyQuery<any>(session.shop, session.accessToken, `query { shop { name } }`);
  console.log(`  Live ping OK — connected to "${ping.data.shop.name}"`);

  // 2. Parse SQL dump
  console.log(`\nParsing ${DUMP_FILENAME}...`);
  const sql = fs.readFileSync(path.resolve(__dirname, `../${DUMP_FILENAME}`), "utf8");

  const retailers = parseInsert(sql, "retailers", [
    "id", "first_name", "last_name", "username", "email", "password", "commission", "created_at", "updated_at",
  ]);
  const products = parseInsert(sql, "products", [
    "id", "stockx_id", "title", "description", "price", "image", "sku", "status", "vendor", "created_at", "updated_at", "published_at",
  ]);
  const dumpVariants = parseInsert(sql, "product_variants", [
    "id", "product_id", "sku", "title", "price", "total_discount", "quantity", "position", "inventory_management",
    "inventory_quantity", "old_inventory_quantity", "inventory_item_id", "fulfillment_service", "inventory_policy",
    "requires_shipping", "taxable", "created_at", "updated_at",
  ]);
  const listings = parseInsert(sql, "product_retailer", [
    "id", "product_id", "retailer_id", "quantity", "initial_quantity", "created_at", "updated_at", "title", "variant_id",
    "price", "status", "buy_price", "buy_price_all", "p_status", "p_image", "p_title",
  ]);

  const activeListings = listings.filter((l) => (parseInt(l.quantity) || 0) > 0 && parseFloat(l.price) > 0);
  const activeRetailerIds = new Set(activeListings.map((l) => MERGE_RETAILER[l.retailer_id] ?? l.retailer_id));
  const activeRetailers = retailers.filter((r) => activeRetailerIds.has(r.id) && !MERGE_RETAILER[r.id]);
  const activeProductIds = new Set(activeListings.map((l) => l.product_id));
  const activeProducts = products.filter((p) => activeProductIds.has(p.id));

  const variantsByProductId = new Map<string, DumpVariant[]>();
  for (const v of dumpVariants) {
    if (!activeProductIds.has(v.product_id)) continue;
    const arr = variantsByProductId.get(v.product_id) ?? [];
    arr.push(v);
    variantsByProductId.set(v.product_id, arr);
  }
  const activeVariantsCount = [...variantsByProductId.values()].reduce((n, vs) => n + vs.length, 0);
  const expectedListingsAfterExpansion = activeListings.reduce((n, l) => n + (parseInt(l.quantity) || 0), 0);

  console.log(`  Parsed: ${retailers.length} retailers, ${products.length} products, ${dumpVariants.length} variants, ${listings.length} listings`);
  console.log(`  Active: ${activeRetailers.length} consignors, ${activeProducts.length} products (${activeVariantsCount} variants), ${activeListings.length} listings`);
  console.log(`  After per-item expansion: ${expectedListingsAfterExpansion} Listing rows`);

  if (!GO) {
    console.log(`\nDRY RUN — exiting. Re-run with --go to actually execute.\n`);
    return;
  }

  // 3. Wipe Shopify
  if (!SKIP_WIPE_SHOPIFY) {
    await wipeShopifyProducts(session.shop, session.accessToken);
  } else {
    console.log("\n[wipe-shopify] SKIPPED (--skip-wipe-shopify)");
  }

  // 4. Recreate Shopify products
  let checkpoint: RecreateCheckpoint;
  if (!SKIP_RECREATE_SHOPIFY) {
    checkpoint = await recreateShopifyProducts(session.shop, session.accessToken, activeProducts, variantsByProductId);
  } else {
    const cp = loadCheckpoint();
    if (!cp) throw new Error("--skip-recreate-shopify set but no checkpoint file exists.");
    checkpoint = cp;
    console.log(`\n[recreate-shopify] SKIPPED — loaded ${Object.keys(checkpoint.variantOldToNew).length} variant mappings from checkpoint.`);
  }

  // 5. Wipe Neon
  if (!SKIP_WIPE_NEON) {
    console.log("\n[wipe-neon] Truncating domain tables...");
    await wipeNeon();
    console.log("[wipe-neon] Done.");
  } else {
    console.log("\n[wipe-neon] SKIPPED (--skip-wipe-neon)");
  }

  // 6. Import consignors
  console.log("\n[import-consignors] Creating consignors...");
  const consignorMap = new Map<string, string>();
  for (const r of activeRetailers) {
    const name = `${r.first_name} ${r.last_name}`.trim();
    const email = (EMAIL_OVERRIDES[r.id] ?? r.email).trim().toLowerCase();
    const commission = parseInt(r.commission);
    const feeRate = isNaN(commission) ? 0.15 : commission / 100;
    const storeOwned = STORE_OWNED_IDS.has(r.id);
    const taxStatus = BUSINESS_CONSIGNORS.has(r.id) ? "business" : "individual";
    const province = BUSINESS_CONSIGNORS.has(r.id) ? (ONTARIO_CONSIGNORS.has(r.id) ? "ON" : "QC") : null;

    const consignor = await prisma.consignor.upsert({
      where: { email },
      update: { name, feeRate, storeOwned, taxStatus, province },
      create: { name, email, feeRate, storeOwned, taxStatus, province },
    });
    consignorMap.set(r.id, consignor.id);
  }
  for (const [fromId, toId] of Object.entries(MERGE_RETAILER)) {
    const target = consignorMap.get(toId);
    if (target) consignorMap.set(fromId, target);
  }
  console.log(`[import-consignors] ${consignorMap.size} consignor mappings`);

  // 7. Import products + variants — link to NEW Shopify IDs from checkpoint
  console.log("\n[import-products] Creating products + variants in Neon...");
  const productByOldId = new Map<string, { dbId: string }>();
  const variantByOldId = new Map<string, { dbId: string }>();

  for (const p of activeProducts) {
    const newShopifyProductId = checkpoint.productOldToNewId[p.id];
    if (!newShopifyProductId) continue; // recreate failed for this product

    const dbProduct = await prisma.product.create({
      data: {
        title: p.title,
        brand: p.vendor || null,
        sku: p.stockx_id || null,
        imageUrl: p.image || null,
        shopifyProductId: newShopifyProductId,
      },
    });
    productByOldId.set(p.id, { dbId: dbProduct.id });

    const pVariants = variantsByProductId.get(p.id) ?? [];
    const seenSizes = new Set<string>();
    for (const v of pVariants) {
      if (!v.title || seenSizes.has(v.title)) continue;
      seenSizes.add(v.title);
      const newInfo = checkpoint.variantOldToNew[v.id];
      const dbVariant = await prisma.variant.create({
        data: {
          productId: dbProduct.id,
          size: v.title,
          shopifyVariantId: newInfo?.newVariantId ?? null,
          inventoryItemId: newInfo?.inventoryItemId ?? null,
        },
      });
      variantByOldId.set(v.id, { dbId: dbVariant.id });
    }
  }
  console.log(`[import-products] ${productByOldId.size} products / ${variantByOldId.size} variants in Neon`);

  // 8. Import listings (per-item expansion)
  console.log("\n[import-listings] Creating Listing rows (per-item expansion)...");
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < activeListings.length; i++) {
    const l = activeListings[i];
    const retailerId = MERGE_RETAILER[l.retailer_id] ?? l.retailer_id;
    const consignorId = consignorMap.get(retailerId);
    if (!consignorId) { skipped++; continue; }

    const price = parseFloat(l.price) || 0;
    if (price <= 0) { skipped++; continue; }

    const qty = parseInt(l.quantity) || 0;
    // Try to resolve variant by old Shopify variant_id from dump
    let dbVariantId: string | null = null;
    if (l.variant_id) {
      const hit = variantByOldId.get(l.variant_id);
      if (hit) dbVariantId = hit.dbId;
    }
    // Fall back: lookup by old product_id + size parsed from title
    if (!dbVariantId) {
      const product = productByOldId.get(l.product_id);
      if (product) {
        const titleParts = l.title.split(" - ");
        const size = titleParts.length > 1 ? titleParts[titleParts.length - 1].trim() : null;
        if (size) {
          const v = await prisma.variant.findFirst({ where: { productId: product.dbId, size } });
          if (v) dbVariantId = v.id;
        }
      }
    }
    if (!dbVariantId) { skipped++; continue; }

    // Per-item costs from buy_price_all JSON
    const itemCosts: number[] = [];
    if (STORE_OWNED_IDS.has(l.retailer_id) && l.buy_price_all) {
      try {
        const raw = JSON.parse(l.buy_price_all.replace(/\\\"/g, '"'));
        for (const val of Object.values(raw)) {
          const parsed = parseFloat(val as string);
          if (!isNaN(parsed) && parsed > 0) itemCosts.push(parsed);
        }
      } catch { /* malformed */ }
    }
    if (itemCosts.length === 0 && STORE_OWNED_IDS.has(l.retailer_id) && l.buy_price) {
      const parsed = parseFloat(l.buy_price);
      if (!isNaN(parsed) && parsed > 0) itemCosts.push(parsed);
    }

    try {
      for (let k = 0; k < qty; k++) {
        const cost = itemCosts[k] ?? itemCosts[0] ?? null;
        await prisma.listing.create({
          data: {
            consignorId,
            variantId: dbVariantId,
            price,
            cost,
            status: "active",
            listedAt: l.created_at ? new Date(l.created_at) : new Date(),
          },
        });
        created++;
      }
    } catch (err) {
      errors.push(`ERR listing ${l.id}: ${err instanceof Error ? err.message : String(err)}`);
      skipped++;
    }

    if (i % 100 === 0) process.stdout.write(`\r  ${i}/${activeListings.length} (${created} created, ${skipped} skipped)`);
  }
  process.stdout.write("\n");

  console.log("\n=== DONE ===");
  console.log(`  Consignors: ${consignorMap.size}`);
  console.log(`  Products: ${productByOldId.size}`);
  console.log(`  Variants: ${variantByOldId.size}`);
  console.log(`  Listings: ${created} created, ${skipped} skipped`);
  if (errors.length > 0) {
    console.log(`\n  First 10 errors:`);
    for (const e of errors.slice(0, 10)) console.log(`    ${e}`);
    if (errors.length > 10) console.log(`    ... and ${errors.length - 10} more`);
  }
}

main()
  .catch((err) => {
    console.error("\nFATAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
