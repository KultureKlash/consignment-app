// Money column checksum + pre-flight gate for the Float -> Decimal migration.
//
// Run it BEFORE and AFTER the migration and diff the two outputs. The comparison
// that must hold is:
//
//     ROUND(SUM(col)::numeric, 2)  before   ==   SUM(col)  after
//
// NOT raw SUM(col) before == SUM(col) after. Summing double precision already
// drifts: Listing.price sums to 883297.779999997 when the true total is
// 883297.78. Cleaning that drift is the point of the migration, so a raw-SUM
// comparison would "fail" on exactly the thing being fixed. The expression below
// is identical for both types -- on numeric(10,2) the ROUND is a no-op -- so one
// script produces comparable output on either side.
//
// The gate is `would_change`: rows whose stored value is not already exactly
// representable at 2 decimal places. It must be 0 before migrating, which proves
// the cast preserves every individual value. If it is ever non-zero, stop and
// look at those rows rather than discovering it from a checksum mismatch after.
//
//   npx tsx scripts/money-checksum.ts                      # Neon, human table
//   npx tsx scripts/money-checksum.ts --json > before.json
//   npx tsx scripts/money-checksum.ts --local              # local konsign_test
//   npx tsx scripts/money-checksum.ts --compare before.json

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AS_JSON = process.argv.includes("--json");
const LOCAL = process.argv.includes("--local");
const COMPARE = process.argv.find((a) => a.startsWith("--compare="))?.split("=")[1];

function loadNeonDatabaseUrl(): string {
  const envText = fs.readFileSync(path.resolve(__dirname, "../.env"), "utf8");
  const m = envText.match(/^#\s*DATABASE_URL="?(postgresql:\/\/[^"\s]+neon\.tech[^"\s]*)"?/m);
  if (!m) throw new Error("Neon DATABASE_URL not found (commented postgresql://...neon.tech line in .env)");
  return m[1];
}

process.env.DATABASE_URL = LOCAL
  ? "postgresql://postgres:postgres@localhost:5432/konsign_test"
  : loadNeonDatabaseUrl();

const prisma = new PrismaClient();

/**
 * Every money column. feeRate is deliberately absent: it is a rate, not an
 * amount, and stays Float. See the note in prisma/schema.prisma.
 */
const MONEY_COLUMNS: Array<[table: string, column: string]> = [
  ["Listing", "price"],
  ["Listing", "cost"],
  ["Order", "total"],
  ["Order", "shopifySubtotal"],
  ["Order", "shopifyDiscounts"],
  ["Order", "shopifyTax"],
  ["Order", "shopifyShipping"],
  ["Order", "shopifyTotal"],
  ["OrderItem", "price"],
  ["Transaction", "salePrice"],
  ["Transaction", "cost"],
  ["Transaction", "grossAmount"],
  ["Transaction", "feeAmount"],
  ["Transaction", "consignorAmount"],
  ["Transaction", "amount"],
  ["Payout", "amount"],
];

type Row = {
  column: string;
  rows: number;
  nonNull: number;
  /** ROUND(SUM(col)::numeric, 2) — the cross-type comparable checksum */
  checksum: string;
  /** Raw SUM, kept for the record so the drift is visible */
  rawSum: string;
  min: string;
  max: string;
  /** |SUM - ROUND(SUM,2)|. Non-zero means the float SUM genuinely drifts. */
  drift: string;
  /** Rows not already exactly representable at 2dp. Must be 0 before migrating. */
  wouldChange: number;
};

async function collect(): Promise<Row[]> {
  const out: Row[] = [];
  for (const [table, column] of MONEY_COLUMNS) {
    const sql = `
      SELECT
        count(*)::int                                                   AS rows,
        count("${column}")::int                                         AS nonnull,
        COALESCE(round(sum("${column}")::numeric, 2), 0)::text          AS checksum,
        COALESCE(sum("${column}"), 0)::text                             AS raw_sum,
        COALESCE(min("${column}"), 0)::text                             AS min,
        COALESCE(max("${column}"), 0)::text                             AS max,
        COALESCE(abs(sum("${column}")::numeric - round(sum("${column}")::numeric, 2)), 0)::text AS drift,
        COALESCE(sum(CASE
          WHEN "${column}" IS NOT NULL
           AND "${column}"::numeric(18,8) <> round("${column}"::numeric, 2)
          THEN 1 ELSE 0 END), 0)::int                                   AS would_change
      FROM "${table}"`;
    const [r] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql);
    out.push({
      column: `${table}.${column}`,
      rows: Number(r.rows),
      nonNull: Number(r.nonnull),
      checksum: String(r.checksum),
      rawSum: String(r.raw_sum),
      min: String(r.min),
      max: String(r.max),
      drift: String(r.drift),
      wouldChange: Number(r.would_change),
    });
  }
  return out;
}

function printTable(rows: Row[]) {
  const w = Math.max(...rows.map((r) => r.column.length), 6);
  console.log(
    "column".padEnd(w),
    "rows".padStart(7),
    "nonNull".padStart(8),
    "CHECKSUM".padStart(16),
    "rawSum".padStart(20),
    "change".padStart(7),
  );
  console.log("-".repeat(w + 64));
  for (const r of rows) {
    // Numeric comparison: "76694" and "76694.00" are the same value, only the
    // text differs. Only a non-zero |SUM - ROUND(SUM,2)| is real drift.
    const drift = Number(r.drift) !== 0 ? " <- float drift" : "";
    console.log(
      r.column.padEnd(w),
      String(r.rows).padStart(7),
      String(r.nonNull).padStart(8),
      r.checksum.padStart(16),
      r.rawSum.padStart(20),
      String(r.wouldChange).padStart(7),
      drift,
    );
  }
  console.log("-".repeat(w + 64));
  const totalChange = rows.reduce((s, r) => s + r.wouldChange, 0);
  const drifting = rows.filter((r) => Number(r.drift) !== 0).length;
  console.log(`CHECKSUM column is ROUND(SUM(col)::numeric, 2) -- compare this across the migration.`);
  console.log(`columns whose raw float SUM already drifts: ${drifting}`);
  console.log(
    totalChange === 0
      ? `PRE-FLIGHT GATE: PASS - 0 rows would change value when cast to numeric(10,2)`
      : `PRE-FLIGHT GATE: FAIL - ${totalChange} row(s) would change value. Investigate before migrating.`,
  );
  if (totalChange !== 0) process.exitCode = 1;
}

function compare(before: Row[], after: Row[]) {
  const beforeBy = new Map(before.map((r) => [r.column, r]));
  let mismatches = 0;

  console.log("column".padEnd(32), "before CHECKSUM".padStart(18), "after SUM".padStart(18), "  verdict");
  console.log("-".repeat(92));
  for (const a of after) {
    const b = beforeBy.get(a.column);
    if (!b) {
      console.log(a.column.padEnd(32), "(absent before)".padStart(18), a.checksum.padStart(18), "  NEW");
      continue;
    }
    const ok = b.checksum === a.checksum;
    if (!ok) mismatches++;
    console.log(
      a.column.padEnd(32),
      b.checksum.padStart(18),
      a.checksum.padStart(18),
      ok ? "  MATCH" : "  *** MISMATCH ***",
    );
    if (b.nonNull !== a.nonNull) {
      console.log(`  ${a.column}: nonNull changed ${b.nonNull} -> ${a.nonNull}`);
      mismatches++;
    }
  }
  console.log("-".repeat(92));
  if (mismatches === 0) {
    console.log("ALL COLUMNS MATCH TO THE CENT.");
  } else {
    console.log(`${mismatches} column(s) did not match. The migration did not preserve values.`);
    process.exitCode = 1;
  }
}

const rows = await collect();

if (COMPARE) {
  const before = JSON.parse(fs.readFileSync(COMPARE, "utf8")) as Row[];
  compare(before, rows);
} else if (AS_JSON) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log(`target: ${LOCAL ? "local konsign_test" : "Neon"}\n`);
  printTable(rows);
}

await prisma.$disconnect();
