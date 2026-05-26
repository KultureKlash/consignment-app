// Read-only peek at the dump: schemas + first rows for every table we'll touch.
const fs = require("fs");
const path = require("path");

const sql = fs.readFileSync(path.resolve(__dirname, "../database export real data.sql"), "utf-8");

function showSchema(name) {
  const re = new RegExp("CREATE TABLE `" + name + "`[\\s\\S]+?\\) ENGINE");
  const m = sql.match(re);
  console.log("\n--- " + name + " schema ---");
  console.log(m ? m[0] : "(not found)");
}

function firstTuples(tableName, limit) {
  const re = new RegExp("INSERT INTO `" + tableName + "`[^;]+;");
  const m = sql.match(re);
  if (!m) return [];
  const rest = m[0].slice(m[0].indexOf("VALUES") + 6);
  const tuples = [];
  let depth = 0;
  let inStr = false;
  let start = -1;
  for (let i = 0; i < rest.length && tuples.length < limit; i++) {
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
        if (depth === 0) start = i;
        depth++;
      } else if (c === ")") {
        depth--;
        if (depth === 0) tuples.push(rest.slice(start, i + 1));
      }
    }
  }
  return tuples;
}

const tables = ["products", "product_variants", "retailers", "product_retailer", "orders", "order_items", "transactions"];
for (const t of tables) {
  showSchema(t);
  console.log("--- " + t + " sample rows ---");
  firstTuples(t, 1).forEach((r) => console.log(r.slice(0, 700)));
}
