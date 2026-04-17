import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "~/db.server";
import fs from "fs";
import path from "path";
import { logger } from "~/lib/logger.server";

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
// Kevin Kalra (25) is Ontario; all other business consignors are Quebec
const ONTARIO_CONSIGNORS = new Set(["25"]);

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "1";

  const sql = fs.readFileSync(path.resolve("localhost.sql"), "utf8");
  const log: string[] = [];
  const addLog = (msg: string) => { log.push(msg); };

  const retailers = parseInsert(sql, "retailers", ["id", "first_name", "last_name", "username", "email", "password", "commission", "created_at", "updated_at"]);
  const products = parseInsert(sql, "products", ["id", "stockx_id", "title", "description", "price", "image", "sku", "status", "vendor", "created_at", "updated_at", "published_at"]);
  const variants = parseInsert(sql, "product_variants", ["id", "product_id", "sku", "title", "price", "total_discount", "quantity", "position", "inventory_management", "inventory_quantity", "old_inventory_quantity", "inventory_item_id", "fulfillment_service", "inventory_policy", "requires_shipping", "taxable", "created_at", "updated_at"]);
  const listings = parseInsert(sql, "product_retailer", ["id", "product_id", "retailer_id", "quantity", "initial_quantity", "created_at", "updated_at", "title", "variant_id", "price", "status", "buy_price", "buy_price_all", "p_status", "p_image", "p_title"]);

  const activeListings = listings.filter((l) => (parseInt(l.quantity) || 0) > 0);
  const activeRetailerIds = new Set(activeListings.map((l) => MERGE_RETAILER[l.retailer_id] ?? l.retailer_id));
  const activeRetailers = retailers.filter((r) => activeRetailerIds.has(r.id) && !MERGE_RETAILER[r.id]);

  addLog(`Parsed: ${retailers.length} retailers, ${products.length} products, ${variants.length} variants, ${activeListings.length} active listings`);

  // ── Fetch ALL Shopify products to map titles → Shopify IDs ──
  addLog("Fetching products from Shopify...");
  const shopifyProducts = new Map<string, { id: string; title: string; variants: Array<{ id: string; title: string; sku: string; inventoryItemId: string }> }>();

  let cursor: string | null = null;
  let hasNext = true;
  while (hasNext) {
    const query = cursor
      ? `query { products(first: 50, after: "${cursor}") { pageInfo { hasNextPage endCursor } nodes { id title variants(first: 100) { nodes { id title sku barcode inventoryItem { id } } } } } }`
      : `query { products(first: 50) { pageInfo { hasNextPage endCursor } nodes { id title variants(first: 100) { nodes { id title sku barcode inventoryItem { id } } } } } }`;

    const res = await admin.graphql(query);
    const data = await res.json();
    const page = data.data.products;

    for (const p of page.nodes) {
      shopifyProducts.set(p.title.trim().toLowerCase(), {
        id: p.id,
        title: p.title,
        variants: p.variants.nodes.map((v: any) => ({
          id: v.id,
          title: v.title,
          sku: v.sku ?? "",
          barcode: v.barcode ?? "",
          inventoryItemId: v.inventoryItem.id,
        })),
      });
    }

    hasNext = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }
  addLog(`Fetched ${shopifyProducts.size} products from Shopify`);

  // ── Parse Shopify CSV for barcodes (covers products not on dev store) ──
  const csvBarcodes = new Map<string, string>(); // "title|size" → barcode
  try {
    const csvPath = path.resolve("shopify-export.csv");
    const csvLines = fs.readFileSync(csvPath, "utf8").split("\n");
    const csvHeader = parseCSVLine(csvLines[0]);
    const titleIdx = csvHeader.indexOf("Title");
    const sizeIdx = csvHeader.indexOf("Option1 Value");
    const barcodeIdx = csvHeader.indexOf("Variant Barcode");

    let currentTitle = "";
    for (let i = 1; i < csvLines.length; i++) {
      const f = parseCSVLine(csvLines[i]);
      if (f[titleIdx]?.trim()) currentTitle = f[titleIdx].trim();
      const barcode = f[barcodeIdx]?.trim();
      const size = f[sizeIdx]?.trim();
      if (barcode && /^\d{8,}$/.test(barcode) && currentTitle && size) {
        csvBarcodes.set(`${currentTitle.toLowerCase()}|${size}`, barcode);
      }
    }
    addLog(`Parsed ${csvBarcodes.size} barcodes from Shopify CSV`);
  } catch { addLog("No Shopify CSV found — skipping barcode import"); }

  if (dryRun) {
    return Response.json({ retailers: activeRetailers.length, activeListings: activeListings.length, shopifyProducts: shopifyProducts.size });
  }

  // ── Step 1: Create consignors ──
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
    addLog(`Consignor: ${name} (${email}) ${storeOwned ? "[STORE]" : ""} ${taxStatus}`);
  }
  for (const [fromId, toId] of Object.entries(MERGE_RETAILER)) {
    const target = consignorMap.get(toId);
    if (target) consignorMap.set(fromId, target);
  }

  // ── Step 2: Create products + variants + listings (match to Shopify by title) ──
  const productMap = new Map<string, typeof products[0]>();
  for (const p of products) productMap.set(p.id, p);
  const variantMap = new Map<string, typeof variants[0]>();
  for (const v of variants) variantMap.set(v.id, v);

  let created = 0, skipped = 0, matched = 0, unmatched = 0;

  for (const listing of activeListings) {
    const retailerId = MERGE_RETAILER[listing.retailer_id] ?? listing.retailer_id;
    const consignorId = consignorMap.get(retailerId);
    if (!consignorId) { skipped++; continue; }

    const price = parseFloat(listing.price) || 0;
    if (price <= 0) { skipped++; continue; }

    const qty = parseInt(listing.quantity) || 0;
    const product = productMap.get(listing.product_id);
    const variant = listing.variant_id ? variantMap.get(listing.variant_id) : null;
    const title = product?.title ?? listing.p_title ?? listing.title.split(" - ")[0].trim();
    const brand = product?.vendor ?? null;
    const sku = product?.stockx_id ?? product?.sku ?? null;
    const imageUrl = product?.image ?? listing.p_image ?? null;
    const titleParts = listing.title.split(" - ");
    const size = titleParts.length > 1 ? titleParts[titleParts.length - 1].trim() : "O/S";

    // Get barcode: prefer Shopify API → CSV → skip old app's auto-generated SKU
    const shopifyProd = shopifyProducts.get(title.trim().toLowerCase());
    const shopifyVariant = shopifyProd?.variants.find((v) => {
      const vSize = v.title.split(" / ").pop()?.trim() ?? v.title;
      return vSize === size;
    });
    const gtin = shopifyVariant?.barcode || csvBarcodes.get(`${title.toLowerCase()}|${size}`) || null;

    // Parse per-item costs from buy_price_all JSON (e.g. {"100_1":"250","100_2":"310"})
    const itemCosts: number[] = [];
    if (STORE_OWNED_IDS.has(listing.retailer_id) && listing.buy_price_all) {
      try {
        const raw = JSON.parse(listing.buy_price_all.replace(/\\\"/g, '"'));
        for (const val of Object.values(raw)) {
          const parsed = parseFloat(val as string);
          if (!isNaN(parsed) && parsed > 0) itemCosts.push(parsed);
        }
      } catch { /* malformed JSON — skip */ }
    }
    // Fallback to buy_price if buy_price_all is empty
    if (itemCosts.length === 0 && STORE_OWNED_IDS.has(listing.retailer_id) && listing.buy_price) {
      const parsed = parseFloat(listing.buy_price);
      if (!isNaN(parsed) && parsed > 0) itemCosts.push(parsed);
    }

    try {
      // Find existing product by SKU, then title+brand, then Shopify ID
      let dbProduct = sku ? await prisma.product.findFirst({ where: { sku } }) : null;
      if (!dbProduct) dbProduct = await prisma.product.findFirst({ where: { title: { equals: title, mode: "insensitive" }, brand } });
      if (!dbProduct && shopifyProd) dbProduct = await prisma.product.findFirst({ where: { shopifyProductId: shopifyProd.id } });

      if (!dbProduct) {
        dbProduct = await prisma.product.create({
          data: {
            title, brand, sku: sku || null, imageUrl,
            shopifyProductId: shopifyProd?.id ?? null,
          },
        });
      } else if (shopifyProd && !dbProduct.shopifyProductId) {
        await prisma.product.update({ where: { id: dbProduct.id }, data: { shopifyProductId: shopifyProd.id } });
      }

      // Upsert variant — check by product+size, or by Shopify ID, or by GTIN
      let dbVariant = await prisma.variant.findFirst({ where: { productId: dbProduct.id, size } });
      if (!dbVariant && shopifyVariant) {
        dbVariant = await prisma.variant.findFirst({ where: { shopifyVariantId: shopifyVariant.id } });
      }
      if (!dbVariant) {
        // Check GTIN uniqueness before creating
        let safeGtin = gtin || null;
        if (safeGtin) {
          const existing = await prisma.variant.findFirst({ where: { gtin: safeGtin } });
          if (existing) safeGtin = null; // skip GTIN if already used by another variant
        }
        dbVariant = await prisma.variant.create({
          data: {
            productId: dbProduct.id, size, gtin: safeGtin,
            shopifyVariantId: shopifyVariant?.id ?? null,
            inventoryItemId: shopifyVariant?.inventoryItemId ?? null,
          },
        });
      } else if (shopifyVariant && !dbVariant.shopifyVariantId) {
        await prisma.variant.update({
          where: { id: dbVariant.id },
          data: { shopifyVariantId: shopifyVariant.id, inventoryItemId: shopifyVariant.inventoryItemId },
        });
      }

      if (shopifyProd) matched++; else unmatched++;

      for (let i = 0; i < qty; i++) {
        const cost = itemCosts[i] ?? itemCosts[0] ?? null;
        await prisma.listing.create({
          data: { consignorId, variantId: dbVariant.id, price, cost, status: "active", listedAt: listing.created_at ? new Date(listing.created_at) : new Date() },
        });
      }
      created += qty;
    } catch (err) {
      addLog(`ERR ${title} (${size}): ${err instanceof Error ? err.message : String(err)}`);
      skipped++;
    }
  }

  addLog(`\n=== DONE ===`);
  addLog(`Created: ${created} listings`);
  addLog(`Shopify matched: ${matched}, unmatched: ${unmatched}`);
  addLog(`Skipped: ${skipped}`);

  return new Response(log.join("\n"), { headers: { "Content-Type": "text/plain" } });
}

// ── SQL parser (reads ALL INSERT blocks per table) ──

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
  let depth = 0, current = "", inString = false, escape = false;
  for (let i = 0; i < allValuesStr.length; i++) {
    const ch = allValuesStr[i];
    if (escape) { current += ch; escape = false; continue; }
    if (ch === "\\") { current += ch; escape = true; continue; }
    if (ch === "'" && !escape) { inString = !inString; current += ch; continue; }
    if (inString) { current += ch; continue; }
    if (ch === "(") { if (depth === 0) current = ""; else current += ch; depth++; continue; }
    if (ch === ")") { depth--; if (depth === 0) { const values = parseRow(current); const row: Record<string, string> = {}; for (let j = 0; j < columns.length && j < values.length; j++) row[columns[j]] = values[j]; rows.push(row); } else current += ch; continue; }
    if (depth > 0) current += ch;
  }
  return rows;
}

function parseRow(raw: string): string[] {
  const values: string[] = [];
  let current = "", inString = false, escape = false;
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

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { fields.push(cur); cur = ""; continue; }
    cur += ch;
  }
  fields.push(cur);
  return fields;
}
