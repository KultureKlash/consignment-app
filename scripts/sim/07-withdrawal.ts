// Withdrawal lifecycle verification.
//   W1: request -> approve -> complete  (active -> withdrawal_requested -> pending_pickup -> withdrawn)
//   W2: request -> deny                 (active -> withdrawal_requested -> active)
//   W3: guard — cannot request withdrawal on a non-active listing
// SIMULATION_MODE=1 suppresses email + Shopify sync. Listings restored at end.

import { prisma, check, printSummary, header } from "./_shared.js";
import { requestWithdrawal } from "~/services/submission/consignor-actions.server.js";
import { approveWithdrawal, denyWithdrawal, completeWithdrawal } from "~/services/submission/lifecycle.server.js";

const fakeAdmin: any = { graphql: () => { throw new Error("admin.graphql called under SIMULATION_MODE"); } };
const touched: Array<{ id: string; status: string }> = [];

async function pickActiveListing(): Promise<{ id: string; consignorId: string; productTitle: string; size: string }> {
  const l = await prisma.listing.findFirstOrThrow({
    where: { status: "active", consignor: { status: "active", storeOwned: false } },
    select: { id: true, consignorId: true, variant: { select: { size: true, product: { select: { title: true } } } } },
  });
  return { id: l.id, consignorId: l.consignorId, productTitle: l.variant.product.title, size: l.variant.size };
}

async function restore() {
  for (const t of touched) {
    await prisma.listing.update({
      where: { id: t.id },
      data: { status: "active", withdrawnAt: null, withdrawalApprovedAt: null },
    });
  }
}

async function main() {
  header("scripts/sim/07-withdrawal.ts");

  // ── W1: request -> approve -> complete ──
  console.log(`\n${"=".repeat(60)}\nW1. request -> approve -> complete\n${"=".repeat(60)}`);
  const l1 = await pickActiveListing();
  touched.push({ id: l1.id, status: "active" });
  console.log(`  ${l1.productTitle} (sz ${l1.size}), listing ${l1.id}`);

  const reqd = await requestWithdrawal({ listingId: l1.id, consignorId: l1.consignorId });
  check({
    name: "W1.1 requestWithdrawal: active -> withdrawal_requested",
    expected: "withdrawal_requested",
    actual: reqd.status,
    ok: reqd.status === "withdrawal_requested",
  });

  const appr = await approveWithdrawal({ admin: fakeAdmin, listingId: l1.id });
  check({
    name: "W1.2 approveWithdrawal: withdrawal_requested -> pending_pickup",
    expected: "pending_pickup",
    actual: appr.status,
    ok: appr.status === "pending_pickup",
  });
  check({
    name: "W1.3 withdrawalApprovedAt timestamp set",
    expected: "non-null",
    actual: appr.withdrawalApprovedAt ? "set" : "null",
    ok: !!appr.withdrawalApprovedAt,
  });

  const done = await completeWithdrawal({ listingId: l1.id });
  check({
    name: "W1.4 completeWithdrawal: pending_pickup -> withdrawn",
    expected: "withdrawn",
    actual: done.status,
    ok: done.status === "withdrawn",
  });

  // ── W2: request -> deny ──
  console.log(`\n${"=".repeat(60)}\nW2. request -> deny\n${"=".repeat(60)}`);
  const l2 = await pickActiveListing();
  touched.push({ id: l2.id, status: "active" });
  console.log(`  ${l2.productTitle} (sz ${l2.size}), listing ${l2.id}`);

  await requestWithdrawal({ listingId: l2.id, consignorId: l2.consignorId });
  const denied = await denyWithdrawal({ admin: fakeAdmin, listingId: l2.id, reason: "Part of a pending sale" });
  check({
    name: "W2.1 denyWithdrawal: withdrawal_requested -> active",
    expected: "active",
    actual: denied.status,
    ok: denied.status === "active",
  });

  // ── W3: guard — cannot withdraw a non-active listing ──
  console.log(`\n${"=".repeat(60)}\nW3. guard: cannot request withdrawal on withdrawn listing\n${"=".repeat(60)}`);
  let threw = false;
  let errMsg = "";
  try {
    await requestWithdrawal({ listingId: l1.id, consignorId: l1.consignorId }); // l1 is now "withdrawn"
  } catch (err) { threw = true; errMsg = err instanceof Error ? err.message : String(err); }
  check({
    name: "W3.1 requestWithdrawal rejects non-active listing",
    expected: "throws",
    actual: threw ? `threw: ${errMsg}` : "did NOT throw",
    ok: threw,
  });

  // ── W4: ownership guard — other consignor can't withdraw ──
  console.log(`\n${"=".repeat(60)}\nW4. guard: only the owning consignor can withdraw\n${"=".repeat(60)}`);
  const l4 = await pickActiveListing();
  touched.push({ id: l4.id, status: "active" });
  const otherConsignor = await prisma.consignor.findFirst({
    where: { status: "active", id: { not: l4.consignorId } },
    select: { id: true },
  });
  let ownThrew = false;
  try {
    await requestWithdrawal({ listingId: l4.id, consignorId: otherConsignor!.id });
  } catch { ownThrew = true; }
  check({
    name: "W4.1 requestWithdrawal rejects non-owner consignor",
    expected: "throws (Not authorized)",
    actual: ownThrew ? "threw" : "did NOT throw",
    ok: ownThrew,
  });

  await restore();
  console.log(`\n[cleanup] ${touched.length} listings restored to active.`);
  printSummary();
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(process.exitCode ?? 0); })
  .catch(async (err) => { console.error("\nFATAL:", err); await restore().catch(() => {}); await prisma.$disconnect().catch(() => {}); process.exit(1); });
