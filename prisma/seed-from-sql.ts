/**
 * Seed listings from old app's MySQL SQL dump.
 * Reads localhost.sql, extracts retailers + product_retailer data,
 * creates listings linked to the correct products/variants, and
 * stores Shopify IDs.
 *
 * Run: npx tsx prisma/seed-from-sql.ts
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

// Parse SQL INSERT values — handles quoted strings with escaped quotes
function parseInsertRows(sql: string, tableName: string): string[][] {
  const rows: string[][] = [];
  // Find all INSERT INTO `tableName` statements
  const regex = new RegExp(`INSERT INTO \`${tableName}\`[^(]*\\(([^)]+)\\)\\s+VALUES\\s*`, "gi");
  let match;

  while ((match = regex.exec(sql)) !== null) {
    // Find the VALUES section after this match
    let pos = match.index + match[0].length;
    // Parse each row tuple
    while (pos < sql.length) {
      if (sql[pos] === "(") {
        const values: string[] = [];
        pos++; // skip (
        let done = false;
        while (pos < sql.length && !done) {
          if (sql[pos] === "'") {
            // Quoted string — parse until unescaped closing quote
            pos++;
            let val = "";
            while (pos < sql.length) {
              if (sql[pos] === "\\" && pos + 1 < sql.length) {
                val += sql[pos + 1];
                pos += 2;
              } else if (sql[pos] === "'") {
                if (sql[pos + 1] === "'") { val += "'"; pos += 2; }
                else { pos++; break; }
              } else {
                val += sql[pos];
                pos++;
              }
            }
            values.push(val);
          } else if (sql[pos] === ")") {
            done = true;
            pos++;
          } else if (sql[pos] === "," || sql[pos] === " ") {
            pos++;
          } else if (sql.substring(pos, pos + 4) === "NULL") {
            values.push("");
            pos += 4;
          } else {
            // Unquoted value (number)
            let val = "";
            while (pos < sql.length && sql[pos] !== "," && sql[pos] !== ")") {
              val += sql[pos];
              pos++;
            }
            values.push(val.trim());
          }
        }
        rows.push(values);
      } else if (sql[pos] === "," || sql[pos] === "\n" || sql[pos] === "\r" || sql[pos] === " ") {
        pos++;
      } else if (sql[pos] === ";") {
        break;
      } else {
        pos++;
      }
    }
  }
  return rows;
}

async function main() {
  const sqlPath = path.resolve(__dirname, "../localhost.sql");
  if (!fs.existsSync(sqlPath)) {
    console.error("localhost.sql not found in project root");
    process.exit(1);
  }

  // Pre-process: phpMyAdmin dumps use \\' for escaped apostrophes — normalize to \'
  const sql = fs.readFileSync(sqlPath, "utf-8").replace(/\\\\'/g, "\\'");

  // ── Parse retailers ──
  console.log("Parsing retailers...");
  const retailerRows = parseInsertRows(sql, "retailers");
  // Columns: id, first_name, last_name, username, email, password, commission, created_at, updated_at
  const retailerMap = new Map<string, { email: string; commission: number }>();
  for (const row of retailerRows) {
    const id = row[0];
    const email = row[4];
    const commission = parseInt(row[6], 10);
    retailerMap.set(id, { email, commission });
  }
  console.log(`  Found ${retailerMap.size} retailers`);

  // ── Parse product_retailer (listings) ──
  console.log("Parsing product_retailer...");
  const prRows = parseInsertRows(sql, "product_retailer");
  // Columns: id, product_id, retailer_id, quantity, initial_quantity, created_at, updated_at,
  //          title, variant_id, price, status, buy_price, buy_price_all, p_status, p_image, p_title
  console.log(`  Found ${prRows.length} assignments`);

  // ── Build consignor lookup ──
  const consignors = await prisma.consignor.findMany({ select: { id: true, email: true } });
  const consignorByEmail = new Map<string, string>();
  for (const c of consignors) consignorByEmail.set(c.email.toLowerCase(), c.id);

  // ── Build product lookup by title (lowercase) ──
  const products = await prisma.product.findMany({ select: { id: true, title: true, shopifyProductId: true } });
  const productByTitle = new Map<string, { id: string; shopifyProductId: string | null }>();
  for (const p of products) productByTitle.set(p.title.toLowerCase().trim(), { id: p.id, shopifyProductId: p.shopifyProductId });

  // ── Build variant lookup by productId + size ──
  const variants = await prisma.variant.findMany({ select: { id: true, productId: true, size: true, shopifyVariantId: true } });
  const variantByKey = new Map<string, { id: string; shopifyVariantId: string | null }>();
  for (const v of variants) variantByKey.set(`${v.productId}|${v.size.toLowerCase().trim()}`, { id: v.id, shopifyVariantId: v.shopifyVariantId });

  // ── Create listings ──
  console.log("Creating listings...");
  let created = 0, skipped = 0, shopifyLinked = 0;

  for (const row of prRows) {
    const shopifyProductId = row[1]; // Shopify product ID (numeric)
    const retailerId = row[2];
    const quantity = parseInt(row[3], 10) || 0;
    const title = row[7]; // "Product Name - Size"
    const shopifyVariantId = row[8]; // Shopify variant ID (numeric)
    const price = parseFloat(row[9]) || 0;
    const pTitle = row[15]; // Product title only

    // Find consignor
    const retailer = retailerMap.get(retailerId);
    if (!retailer) { skipped++; continue; }
    const consignorId = consignorByEmail.get(retailer.email.toLowerCase());
    if (!consignorId) { skipped++; continue; }

    // Parse size from title: "Product Name - Size"
    const lastDash = title.lastIndexOf(" - ");
    const size = lastDash !== -1 ? title.slice(lastDash + 3).trim() : "";
    if (!size) { skipped++; continue; }

    // Find product by p_title
    const productTitle = (pTitle || "").trim();
    const product = productByTitle.get(productTitle.toLowerCase());
    if (!product) { skipped++; continue; }

    // Find variant by product + size
    const variant = variantByKey.get(`${product.id}|${size.toLowerCase()}`);
    if (!variant) { skipped++; continue; }

    // Determine status
    const status = quantity > 0 ? "active" : "sold";

    // Create listing
    try {
      await prisma.listing.create({
        data: {
          consignorId,
          variantId: variant.id,
          price,
          status,
          ...(status === "sold" ? { soldAt: new Date() } : {}),
        },
      });
      created++;

      // Link Shopify IDs if not already linked
      if (shopifyProductId && !product.shopifyProductId) {
        try {
          await prisma.product.update({
            where: { id: product.id },
            data: { shopifyProductId: `gid://shopify/Product/${shopifyProductId}` },
          });
          product.shopifyProductId = `gid://shopify/Product/${shopifyProductId}`;
        } catch { /* unique constraint — already linked */ }
      }

      if (shopifyVariantId && !variant.shopifyVariantId) {
        try {
          await prisma.variant.update({
            where: { id: variant.id },
            data: { shopifyVariantId: `gid://shopify/ProductVariant/${shopifyVariantId}` },
          });
          variant.shopifyVariantId = `gid://shopify/ProductVariant/${shopifyVariantId}`;
          shopifyLinked++;
        } catch { /* unique constraint — already linked */ }
      }
    } catch (err) {
      skipped++;
    }
  }

  console.log(`\nDone!`);
  console.log(`  Listings created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Shopify variants linked: ${shopifyLinked}`);

  // Summary
  const linkedProducts = await prisma.product.count({ where: { shopifyProductId: { not: null } } });
  const linkedVariants = await prisma.variant.count({ where: { shopifyVariantId: { not: null } } });
  console.log(`  Total products linked to Shopify: ${linkedProducts}`);
  console.log(`  Total variants linked to Shopify: ${linkedVariants}`);
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
