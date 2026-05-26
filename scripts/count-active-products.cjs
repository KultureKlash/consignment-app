// How many unique products are actually referenced by ACTIVE listings?
const fs = require("fs");
const path = require("path");

const sql = fs.readFileSync(path.resolve(__dirname, "../database export real data.sql"), "utf-8");

function parseInsert(table, columns) {
  const regex = new RegExp("INSERT INTO `" + table + "`[^)]*\\)\\s*VALUES\\s*", "g");
  let all = "";
  let m;
  while ((m = regex.exec(sql)) !== null) {
    const start = m.index + m[0].length;
    const end = sql.indexOf(";\n", start);
    all += (all ? "," : "") + sql.substring(start, end === -1 ? undefined : end);
  }
  const rows = [];
  let depth = 0, cur = "", inStr = false, esc = false;
  for (let i = 0; i < all.length; i++) {
    const ch = all[i];
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === "\\") { cur += ch; esc = true; continue; }
    if (ch === "'" && !esc) { inStr = !inStr; cur += ch; continue; }
    if (inStr) { cur += ch; continue; }
    if (ch === "(") { if (depth === 0) cur = ""; else cur += ch; depth++; continue; }
    if (ch === ")") {
      depth--;
      if (depth === 0) {
        const vals = parseRow(cur);
        const row = {};
        for (let j = 0; j < columns.length && j < vals.length; j++) row[columns[j]] = vals[j];
        rows.push(row);
      } else cur += ch;
      continue;
    }
    if (depth > 0) cur += ch;
  }
  return rows;
}

function parseRow(raw) {
  const v = [];
  let c = "", inStr = false, esc = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) { c += ch; esc = false; continue; }
    if (ch === "\\" && inStr) { esc = true; continue; }
    if (ch === "'") { inStr = !inStr; continue; }
    if (ch === "," && !inStr) { v.push(c.trim()); c = ""; continue; }
    c += ch;
  }
  v.push(c.trim());
  return v.map((x) => (x === "NULL" ? "" : x));
}

const listings = parseInsert("product_retailer", [
  "id", "product_id", "retailer_id", "quantity", "initial_quantity", "created_at", "updated_at",
  "title", "variant_id", "price", "status", "buy_price", "buy_price_all", "p_status", "p_image", "p_title",
]);
const variants = parseInsert("product_variants", [
  "id", "product_id", "sku", "title", "price", "total_discount", "quantity", "position",
  "inventory_management", "inventory_quantity", "old_inventory_quantity", "inventory_item_id",
  "fulfillment_service", "inventory_policy", "requires_shipping", "taxable", "created_at", "updated_at",
]);

const activeListings = listings.filter((l) => (parseInt(l.quantity) || 0) > 0 && parseFloat(l.price) > 0);
const activeProductIds = new Set(activeListings.map((l) => l.product_id));
const activeVariantIds = new Set(activeListings.map((l) => l.variant_id).filter(Boolean));

// Variants belonging to active products
const variantsInActiveProducts = variants.filter((v) => activeProductIds.has(v.product_id));

console.log("Active listings (qty > 0, price > 0):       " + activeListings.length);
console.log("Unique products referenced by active list.: " + activeProductIds.size);
console.log("Unique variants referenced by active list.: " + activeVariantIds.size);
console.log("Total variants on those products:           " + variantsInActiveProducts.length);
console.log("");
console.log("So if we only recreate products that have ACTIVE listings, we create");
console.log("  " + activeProductIds.size + " products + " + variantsInActiveProducts.length + " variants in Shopify");
console.log("(vs. " + new Set(variants.map((v) => v.product_id)).size + " products + " + variants.length + " variants if we do everything)");
