/**
 * Seed script: imports products from Shopify CSV export + consignors from db-export.json.
 *
 * Usage:
 *   npx tsx prisma/seed-shopify.ts
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function main() {
  // ── Load Shopify CSV ──
  const csvPath = path.resolve(__dirname, "../shopify-export.csv");
  if (!fs.existsSync(csvPath)) {
    console.error("shopify-export.csv not found in project root");
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rows: Record<string, string>[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  console.log(`Parsed ${rows.length} CSV rows`);

  // ── Load consignors from db-export.json ──
  const dbExportPath = path.resolve(__dirname, "../db-export.json");
  let consignorData: Array<{
    name: string;
    email: string;
    phone: string | null;
    taxStatus: string;
    province: string | null;
    feeRate: number;
    storeOwned: boolean;
  }> = [];

  if (fs.existsSync(dbExportPath)) {
    const dbExport = JSON.parse(fs.readFileSync(dbExportPath, "utf-8"));
    consignorData = dbExport.consignors ?? [];
    console.log(`Found ${consignorData.length} consignors in db-export.json`);
  } else {
    console.log("No db-export.json found — skipping consignors");
  }

  // ── 1. Seed Consignors ──
  console.log("Seeding consignors...");
  const consignorMap = new Map<string, string>();
  const seenEmails = new Set<string>();
  for (const c of consignorData) {
    const emailLower = c.email.toLowerCase();
    if (seenEmails.has(emailLower)) continue;
    seenEmails.add(emailLower);
    const created = await prisma.consignor.create({
      data: {
        name: c.name,
        email: emailLower,
        phone: c.phone,
        taxStatus: c.taxStatus || "individual",
        province: c.province,
        storeOwned: c.storeOwned || false,
        feeRate: c.feeRate ?? 0.15,
        status: "active",
      },
    });
    consignorMap.set(emailLower, created.id);
  }
  console.log(`  ✓ ${consignorMap.size} consignors`);

  // ── 2. Parse products + variants from CSV ──
  console.log("Seeding products from Shopify CSV...");

  // Group rows by handle (first row = product, rest = variant-only rows)
  const productGroups = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const handle = row["Handle"];
    if (!handle) continue;
    const list = productGroups.get(handle) || [];
    list.push(row);
    productGroups.set(handle, list);
  }

  console.log(`  Found ${productGroups.size} unique products`);

  let productCount = 0;
  let variantCount = 0;
  let skippedProducts = 0;
  const productMap = new Map<string, string>(); // title -> id
  const variantMap = new Map<string, string>(); // "title|size" -> id

  const usedStyleIds = new Set<string>();
  for (const [, groupRows] of productGroups) {
    // First row with Title = product row
    const productRow = groupRows.find((r) => r["Title"]?.trim());
    if (!productRow) {
      skippedProducts++;
      continue;
    }

    const title = productRow["Title"].trim();
    const vendor = productRow["Vendor"]?.trim() || null;
    const shopifyCategory = productRow["Product Category"]?.trim() || null;
    const imageUrl = productRow["Image Src"]?.trim() || null;
    const sku = productRow["Variant SKU"]?.trim() || null;
    const status = productRow["Status"]?.trim() || "active";

    // Skip draft/archived products
    if (status !== "active") {
      skippedProducts++;
      continue;
    }

    // Map Shopify category to our local category
    const category = mapShopifyCategory(shopifyCategory);

    // Skip duplicate titles
    if (productMap.has(title)) {
      skippedProducts++;
      continue;
    }

    // Extract styleId from SKU (e.g. "CT8012-005-10" → "CT8012-005")
    let styleId = sku ? extractStyleId(sku) : null;
    // Avoid duplicate styleIds
    if (styleId && usedStyleIds.has(styleId)) styleId = null;
    if (styleId) usedStyleIds.add(styleId);

    const product = await prisma.product.create({
      data: {
        title,
        brand: vendor,
        category,
        styleId,
        imageUrl,
      },
    });
    productMap.set(title, product.id);
    productCount++;

    // Create variants from all rows in the group
    for (const row of groupRows) {
      const size = row["Option1 Value"]?.trim();
      if (!size) continue;

      const variantKey = `${title}|${size}`;
      if (variantMap.has(variantKey)) continue;

      const barcode = row["Variant Barcode"]?.trim() || null;

      try {
        const variant = await prisma.variant.create({
          data: {
            productId: product.id,
            size,
            gtin: barcode,
          },
        });
        variantMap.set(variantKey, variant.id);
        variantCount++;
      } catch {
        // Duplicate gtin or product+size — skip
      }
    }
  }

  console.log(`  ✓ ${productCount} products, ${variantCount} variants (${skippedProducts} skipped)`);
  console.log(`\nDone! Database seeded with ${consignorMap.size} consignors, ${productCount} products, ${variantCount} variants.`);
  console.log("No listings, orders, or transactions — start fresh from real activity.");
}

/**
 * Map Shopify taxonomy category to our single-word format.
 * e.g. "Apparel & Accessories > Clothing > Activewear > Activewear Tops > T-Shirts" → "T-Shirts"
 */
function mapShopifyCategory(shopifyCategory: string | null): string | null {
  if (!shopifyCategory) return null;

  const lower = shopifyCategory.toLowerCase();

  // Footwear
  if (lower.includes("sneakers")) return "Sneakers";
  if (lower.includes("boots")) return "Boots";
  if (lower.includes("sandals") || lower.includes("slides")) return "Slides";
  if (lower.includes("loafers")) return "Loafers";
  if (lower.includes("heels")) return "Heels";
  if (lower.includes("shoes") || lower.includes("footwear")) return "Sneakers";

  // Apparel — specific first
  if (lower.includes("t-shirt") || lower.includes("tee")) return "T-Shirts";
  if (lower.includes("hoodie") || lower.includes("sweatshirt")) return "Hoodies";
  if (lower.includes("sweater") || lower.includes("knit")) return "Sweaters";
  if (lower.includes("jacket") || lower.includes("coat") || lower.includes("outerwear")) return "Jackets";
  if (lower.includes("vest")) return "Vests";
  if (lower.includes("jeans") || lower.includes("denim")) return "Jeans";
  if (lower.includes("short")) return "Shorts";
  if (lower.includes("pant") || lower.includes("trouser")) return "Pants";
  if (lower.includes("jersey")) return "Jerseys";
  if (lower.includes("polo")) return "Polos";
  if (lower.includes("clothing top") || lower.includes("shirt")) return "T-Shirts";
  if (lower.includes("clothing")) return "T-Shirts"; // generic apparel fallback

  // Headwear
  if (lower.includes("hat") || lower.includes("cap") || lower.includes("beanie")) return "Caps";

  // Accessories
  if (lower.includes("bag") || lower.includes("backpack") || lower.includes("tote")) return "Bags";
  if (lower.includes("wallet")) return "Wallets";
  if (lower.includes("belt")) return "Belts";
  if (lower.includes("sunglasses") || lower.includes("eyewear")) return "Sunglasses";
  if (lower.includes("jewelry") || lower.includes("watch")) return "Jewelry";

  // Fallback — take the last segment
  const parts = shopifyCategory.split(" > ");
  return parts[parts.length - 1].trim();
}

/**
 * Extract styleId from a SKU.
 * "CT8012-005-10" → "CT8012-005"
 * "DV0833-103-8.5" → "DV0833-103"
 */
function extractStyleId(sku: string): string | null {
  // Pattern: letters+digits-digits (optionally more segments), strip last part if it looks like a size
  const parts = sku.split("-");
  if (parts.length < 2) return sku;

  // If last part is a number (size), drop it
  const last = parts[parts.length - 1];
  if (/^\d+\.?\d*$/.test(last) || /^\d+[wWyY]?$/.test(last)) {
    return parts.slice(0, -1).join("-");
  }
  return sku;
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
