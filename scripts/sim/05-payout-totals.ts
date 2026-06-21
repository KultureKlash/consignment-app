// Per-consignor balance verification.
//
// Two modes:
//   - DEFAULT (read-only): walk every consignor's existing transactions +
//     payouts and verify the math. Useful AFTER you've actually used the
//     system. On a clean slate (no payouts yet) this reports "nothing to
//     verify" cleanly.
//   - --simulate: dry-run a synthetic bulk payout for every consignor with
//     ≥1 unpaid sale transaction. Verifies createPayout()'s totals match the
//     sum of selected transactions. Rolled back via cleanup at the end.
//
// Either way: SIMULATION_MODE=1 so no email goes out.

import { prisma, check, printSummary, header } from "./_shared.js";
import { createPayout } from "~/services/admin/payouts.server.js";

const SIMULATE = process.argv.includes("--simulate");
const RUN_ID = `sim-pt-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

// ── Mode 1: read-only verify existing payouts ──
async function verifyExistingPayouts() {
  console.log(`\nVerifying existing payouts in Neon...`);

  const consignors = await prisma.consignor.findMany({
    select: {
      id: true, name: true, email: true,
      _count: { select: { payouts: true, transactions: true } },
    },
  });
  const withActivity = consignors.filter((c) => c._count.transactions > 0 || c._count.payouts > 0);

  if (withActivity.length === 0) {
    check({
      name: "Existing payout totals",
      expected: "consignors with transactions or payouts",
      actual: "0 consignors have transaction or payout activity (clean slate)",
      ok: true,
      details: "Nothing to verify. Re-run after using the system, or pass --simulate to dry-run.",
    });
    return;
  }

  let consignorsChecked = 0;
  let consignorsOK = 0;
  const mismatches: string[] = [];

  for (const c of withActivity) {
    consignorsChecked++;
    // Sum of all sale transactions (gross consignor amount earned)
    const txns = await prisma.transaction.findMany({
      where: { consignorId: c.id },
      select: { id: true, type: true, amount: true, payoutItems: { select: { payoutId: true } } },
    });
    const totalEarned = txns.filter((t) => t.type === "sale").reduce((s, t) => s + t.amount, 0);
    const totalRefunded = txns.filter((t) => t.type === "refund").reduce((s, t) => s + Math.abs(t.amount), 0);
    const netBalance = totalEarned - totalRefunded;

    // Sum of all payouts
    const payouts = await prisma.payout.findMany({
      where: { consignorId: c.id },
      select: { id: true, amount: true, status: true, items: { select: { transactionId: true } } },
    });
    const paidOut = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
    const pending = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0);
    const invoiced = payouts.filter((p) => p.status === "invoiced").reduce((s, p) => s + p.amount, 0);
    const allPayoutSum = paidOut + pending + invoiced;

    // Every txn covered by a payout
    const txnsInPayouts = new Set(payouts.flatMap((p) => p.items.map((i) => i.transactionId)));
    const txnIds = new Set(txns.filter((t) => t.type === "sale").map((t) => t.id));
    const uncoveredTxns = [...txnIds].filter((id) => !txnsInPayouts.has(id));

    const allOk = Math.abs(allPayoutSum - netBalance) < 0.05;

    if (allOk && uncoveredTxns.length === 0) {
      consignorsOK++;
    } else {
      mismatches.push(`  ${c.name}: earned=$${totalEarned.toFixed(2)}, refunded=$${totalRefunded.toFixed(2)}, net=$${netBalance.toFixed(2)}, sum(payouts)=$${allPayoutSum.toFixed(2)}, uncovered_txns=${uncoveredTxns.length}`);
    }
  }

  check({
    name: "Per-consignor payout totals balance to transactions",
    expected: `${consignorsChecked} consignors with sum(payouts) within $0.05 of net earnings`,
    actual: `${consignorsOK}/${consignorsChecked} balanced`,
    ok: consignorsOK === consignorsChecked,
    details: mismatches.slice(0, 20).join("\n"),
  });
}

// ── Mode 2: simulate synthetic payouts for verification ──
const created = { payoutIds: new Set<string>() };

async function simulateSyntheticPayouts() {
  console.log(`\nSimulating synthetic payouts (rolled back at end)...`);

  const consignors = await prisma.consignor.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
  });

  let simulated = 0;
  let mathOk = 0;
  const mismatches: string[] = [];

  for (const c of consignors) {
    // Find unpaid sale transactions (not in any payout yet, not refunded)
    const txns = await prisma.transaction.findMany({
      where: {
        consignorId: c.id,
        type: "sale",
        payoutItems: { none: {} },
        orderItem: { status: { not: "refunded" } },
      },
      select: { id: true, amount: true },
    });
    if (txns.length === 0) continue;

    const expectedSum = txns.reduce((s, t) => s + t.amount, 0);
    try {
      const payout = await createPayout({
        consignorId: c.id,
        transactionIds: txns.map((t) => t.id),
      });
      created.payoutIds.add(payout.id);
      simulated++;
      if (Math.abs(payout.amount - expectedSum) < 0.01) {
        mathOk++;
      } else {
        mismatches.push(`  ${c.name}: txn_sum=$${expectedSum.toFixed(2)}, payout.amount=$${payout.amount.toFixed(2)}, diff=$${(payout.amount - expectedSum).toFixed(2)}`);
      }
    } catch (err) {
      mismatches.push(`  ${c.name}: createPayout failed - ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  check({
    name: "createPayout().amount == sum of selected transaction amounts",
    expected: `${simulated} synthetic payouts with matching totals`,
    actual: `${mathOk}/${simulated} matched`,
    ok: mathOk === simulated && simulated > 0,
    details: mismatches.slice(0, 20).join("\n"),
  });
}

async function cleanupSynthetic() {
  if (created.payoutIds.size === 0) return;
  console.log(`\n[cleanup] Deleting ${created.payoutIds.size} synthetic payouts...`);
  await prisma.payout.deleteMany({ where: { id: { in: [...created.payoutIds] } } });
  console.log("  Cleanup OK.");
}

async function main() {
  header(`scripts/sim/05-payout-totals.ts (${SIMULATE ? "SIMULATE mode" : "verify mode"})`);

  try {
    if (SIMULATE) {
      await simulateSyntheticPayouts();
    } else {
      await verifyExistingPayouts();
    }
  } finally {
    await cleanupSynthetic();
  }

  printSummary();
}

main()
  .catch((err) => { console.error("\nFATAL:", err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
