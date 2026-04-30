const fs = require("fs");
const sql = fs.readFileSync("localhost.sql", "utf8");

const regex = /INSERT INTO `product_retailer`[^)]*\)\s*VALUES\s*/g;
let allValues = "";
let match;
while ((match = regex.exec(sql)) !== null) {
  const start = match.index + match[0].length;
  const end = sql.indexOf(";\n", start);
  allValues += (allValues ? "," : "") + sql.substring(start, end === -1 ? undefined : end);
}

function parseAllRows(block) {
  const rows = [];
  let depth = 0, cur = "", inStr = false, esc = false;
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === "\\" && inStr) { esc = true; cur += ch; continue; }
    if (ch === "'" && !esc) { inStr = !inStr; cur += ch; continue; }
    if (inStr) { cur += ch; continue; }
    if (ch === "(") { if (depth === 0) cur = ""; depth++; continue; }
    if (ch === ")") { depth--; if (depth === 0) rows.push(cur); continue; }
    if (depth > 0) cur += ch;
  }
  return rows;
}

function parseFields(raw) {
  const values = [];
  let cur = "", inStr = false, esc = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === "\\" && inStr) { esc = true; cur += ch; continue; }
    if (ch === "'" && !esc) { inStr = !inStr; continue; }
    if (ch === "," && !inStr) { values.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  values.push(cur.trim());
  return values.map(v => v === "NULL" ? null : v);
}

const retailers = { "11": "Marco Del Papa", "13": "Kevin Sayers", "15": "Michael Derderian", "16": "Yaroslav Bilodid", "18": "Mansour Abassi", "23": "Niloy Hossain", "24": "Farouk Ghorayeb", "25": "Kevin Kalra", "27": "Kulture Klash", "30": "Fabien Bueno", "34": "Harish Harish", "35": "Justin Buno", "36": "betchu kicks", "41": "Dalton Hardee", "42": "dior dior", "44": "Kulture Klothing", "46": "Andrew Boutros", "47": "Lace up", "49": "SourceByKulture", "50": "Mike 15%" };

const rows = parseAllRows(allValues);
const unpriced = [];

for (const raw of rows) {
  const f = parseFields(raw);
  const qty = parseInt(f[3]) || 0;
  if (qty <= 0) continue;
  const price = f[9] ? parseFloat(f[9]) : null;
  if (price === null || isNaN(price) || price <= 0) {
    unpriced.push({ title: f[7] || "Unknown", qty, consignor: retailers[f[2]] || f[2] });
  }
}

console.log("=== UNPRICED ITEMS (active inventory, no/zero price) ===");
console.log("Total: " + unpriced.length + " rows, " + unpriced.reduce((s, r) => s + r.qty, 0) + " items\n");
for (const r of unpriced) {
  console.log(r.consignor.padEnd(20) + " | " + r.title + " | qty: " + r.qty);
}
