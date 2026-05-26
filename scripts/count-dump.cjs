// Quick read-only count of rows per table in the Laravel SQL dump.
const fs = require("fs");
const path = require("path");

const dumpPath = path.resolve(__dirname, "../database export real data.sql");
const sql = fs.readFileSync(dumpPath, "utf-8");

const tables = [
  "retailers",
  "products",
  "product_variants",
  "product_retailer",
  "orders",
  "order_items",
  "transactions",
  "users",
  "info_xstock",
];

for (const t of tables) {
  const re = new RegExp("INSERT INTO `" + t + "`[^;]+;", "g");
  const blocks = sql.match(re) || [];
  let total = 0;
  for (const b of blocks) {
    const valuesIdx = b.indexOf("VALUES");
    if (valuesIdx < 0) continue;
    const rest = b.slice(valuesIdx + 6);
    let depth = 0;
    let inStr = false;
    let tuples = 0;
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i];
      if (inStr) {
        if (c === "\\") {
          i++;
          continue;
        }
        if (c === "'") inStr = false;
      } else {
        if (c === "'") inStr = true;
        else if (c === "(") {
          if (depth === 0) tuples++;
          depth++;
        } else if (c === ")") depth--;
      }
    }
    total += tuples;
  }
  console.log(t.padEnd(20) + total + " rows (" + blocks.length + " INSERTs)");
}
