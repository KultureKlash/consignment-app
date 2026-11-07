/**
 * Trigger a REAL payout through the production pipeline.
 * Bundles a consignor's unpaid sale transactions into a payout and marks it
 * paid. Commits to Neon. No email (NODE_ENV stays development).
 *
 * Run dry:  npx tsx scripts/trigger-payout.ts <consignorEmail>
 * Execute:  npx tsx scripts/trigger-payout.ts <consignorEmail> --go
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadNeonDatabaseUrl(): string {
  const envText = fs.readFileSync(path.resolve(__dirname, "../.env"), "utf8");
  const m = envText.match(/^#\s*DATABASE_URL="?(postgresql:\/\/[^"\s]+neon\.tech[^"\s]*)"?/m);
  if (!m) throw new Error("Neon DATABASE_URL not found in .env");
  return m[1];
}
process.env.DATABASE_URL = loadNeonDatabaseUrl();
process.env.NODE_ENV = "development"; // suppress email
delete process.env.SIMULATION_MODE;

const GO = process.argv.includes("--go");
const email = process.argv.find((a) => a.includes("@"));

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const { createPayout, markInvoiced, markPaid } = await import("~/services/admin/payouts.server.js");

async function main() {
  console.log(`\n=== trigger-payout.ts — ${GO ? "EXECUTE (real payout!)" : "DRY RUN"} ===\n`);
  if (!email) { console.error("Usage: npx tsx scripts/trigger-payout.ts <consignorEmail> [--go]"); process.exit(1); }

  const consignor = await prisma.consignor.findFirstOrThrow({ where: { email } });

  // Unpaid sale transactions (not in any payout, not refunded)
  const txns = await prisma.transaction.findMany({
    where: {
      consignorId: consignor.id,
      type: "sale",
      payoutItems: { none: {} },
      orderItem: { status: { not: "refunded" } },
    },
    select: { id: true, amount: true, salePrice: true, orderItem: { select: { listing: { select: { variant: { select: { size: true, product: { select: { title: true } } } } } } } } },
  });

  const total = txns.reduce((s, t) => s + t.amount.toNumber(), 0);

  console.log(`Consignor: ${consignor.name} <${consignor.email}> (tax=${consignor.taxStatus})`);
  console.log(`Unpaid sale transactions: ${txns.length}`);
  for (const t of txns) {
    const p = t.orderItem?.listing.variant.product.title ?? "?";
    const sz = t.orderItem?.listing.variant.size ?? "?";
    console.log(`  - ${p} (sz ${sz}): sold $${t.salePrice.toFixed(2)} -> owed $${t.amount.toFixed(2)}`);
  }
  console.log(`\nEXPECTED payout total: $${total.toFixed(2)}`);
  console.log(`Path: ${consignor.taxStatus === "business" ? "PENDING -> INVOICED -> PAID (business)" : "PENDING -> PAID (individual)"}`);

  if (txns.length === 0) { console.log(`\nNothing to pay out.\n`); return; }
  if (!GO) { console.log(`\nDRY RUN — re-run with --go to actually create + pay the payout.\n`); return; }

  console.log(`\nCreating payout...`);
  const payout = await createPayout({ consignorId: consignor.id, transactionIds: txns.map((t) => t.id) });
  console.log(`  Payout ${payout.id} created: status=${payout.status}, amount=$${payout.amount.toFixed(2)}`);

  if (consignor.taxStatus === "business") {
    const inv = await markInvoiced(payout.id);
    console.log(`  markInvoiced -> ${inv.status}`);
  }
  const paid = await markPaid(payout.id);
  console.log(`  markPaid -> ${paid.status}`);

  // Verify
  const final = await prisma.payout.findUniqueOrThrow({ where: { id: payout.id }, include: { items: true } });

  console.log(`\n=== RESULT (expected vs actual) ===\n`);
  const rows: Array<[string, string, string, boolean]> = [
    ["Payout amount", `$${total.toFixed(2)}`, `$${final.amount.toFixed(2)}`, Math.abs(final.amount.toNumber() - total) < 0.01],
    ["Payout status", "paid", final.status, final.status === "paid"],
    ["Items bundled", `${txns.length}`, `${final.items.length}`, final.items.length === txns.length],
  ];
  let ok = true;
  for (const [n, e, a, good] of rows) { if (!good) ok = false; console.log(`  [${good ? "OK " : "XX "}] ${n.padEnd(16)} expected=${String(e).padEnd(10)} actual=${a}`); }
  console.log(`\n${ok ? "ALL GOOD" : "MISMATCH"}`);
  console.log(`No email was sent (NODE_ENV=development).`);
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (err) => { console.error("\nFATAL:", err); await prisma.$disconnect().catch(() => {}); process.exit(1); });
