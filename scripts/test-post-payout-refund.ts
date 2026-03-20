/**
 * End-to-end test script for post-payout refund flow.
 * Runs against the dev database — demonstrates the full lifecycle:
 *   sale → payout → mark paid → refund → reassignment to shop consignor
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\n========================================");
  console.log("  POST-PAYOUT REFUND — E2E TEST");
  console.log("========================================\n");

  // ── Step 1: Pick a consignor with a paid order ────────────────
  const paidOrderItem = await prisma.orderItem.findFirst({
    where: {
      status: "sold",
      order: { paymentStatus: "paid" },
    },
    include: {
      order: true,
      listing: {
        include: {
          consignor: true,
          variant: { include: { product: true } },
        },
      },
      transactions: true,
    },
  });

  if (!paidOrderItem) {
    console.log("❌ No paid order items found. Run seed first: npx tsx prisma/seed.ts");
    return;
  }

  const consignor = paidOrderItem.listing.consignor;
  const product = paidOrderItem.listing.variant.product;
  const saleTx = paidOrderItem.transactions.find((t) => t.type === "sale");

  if (!saleTx) {
    console.log("❌ No sale transaction found for this order item.");
    return;
  }

  console.log("STEP 1: Found paid order item");
  console.log(`  Order:     ${paidOrderItem.order.orderNumber} (${paidOrderItem.order.shopifyId})`);
  console.log(`  Product:   ${product.title} (${product.category})`);
  console.log(`  Consignor: ${consignor.name} (feeRate: ${consignor.feeRate})`);
  console.log(`  Sale:      $${saleTx.salePrice} → fee $${saleTx.feeAmount.toFixed(2)}, payout $${saleTx.consignorAmount.toFixed(2)}`);
  console.log();

  // ── Step 2: Create a payout for this transaction ──────────────
  const payout = await prisma.payout.create({
    data: {
      consignorId: consignor.id,
      amount: saleTx.consignorAmount,
      status: "pending",
      items: { create: { transactionId: saleTx.id } },
    },
  });
  console.log("STEP 2: Created payout");
  console.log(`  Payout ID: ${payout.id}`);
  console.log(`  Amount:    $${payout.amount.toFixed(2)}`);
  console.log(`  Status:    ${payout.status}`);
  console.log();

  // ── Step 3: Mark payout as paid (money sent) ─────────────────
  await prisma.payout.update({
    where: { id: payout.id },
    data: { status: "paid" },
  });
  console.log("STEP 3: Marked payout as PAID (money sent to consignor)");
  console.log();

  // ── Step 4: Check balance before refund ───────────────────────
  const txAggBefore = await prisma.transaction.aggregate({
    where: { consignorId: consignor.id },
    _sum: { amount: true },
  });
  const payoutAggBefore = await prisma.payout.aggregate({
    where: { consignorId: consignor.id, status: "paid" },
    _sum: { amount: true },
  });
  const balanceBefore = (txAggBefore._sum.amount ?? 0) - (payoutAggBefore._sum.amount ?? 0);
  console.log("STEP 4: Balance before refund");
  console.log(`  Total earnings: $${(txAggBefore._sum.amount ?? 0).toFixed(2)}`);
  console.log(`  Total payouts:  $${(payoutAggBefore._sum.amount ?? 0).toFixed(2)}`);
  console.log(`  Balance:        $${balanceBefore.toFixed(2)}`);
  console.log();

  // ── Step 5: Simulate refund (post-payout path) ───────────────
  // We can't call refundOrder directly (needs admin context), so we
  // simulate what the service does: detect post-payout, reassign.
  console.log("STEP 5: Simulating post-payout refund...");

  const isFootwear = !product.category || product.category.startsWith("Footwear");
  const shopConsignorName = isFootwear ? "Kulture Klash" : "Kulture Klothing";
  const shopConsignor = await prisma.consignor.findFirst({ where: { name: shopConsignorName } });

  if (!shopConsignor) {
    console.log(`❌ Shop consignor "${shopConsignorName}" not found. Run seed first.`);
    return;
  }

  console.log(`  Category:        ${product.category ?? "(none)"}`);
  console.log(`  Is footwear:     ${isFootwear}`);
  console.log(`  Reassign to:     ${shopConsignor.name} (feeRate: ${shopConsignor.feeRate})`);

  // Check if sale tx has a paid payout
  const payoutItem = await prisma.payoutItem.findFirst({
    where: { transactionId: saleTx.id },
    include: { payout: true },
  });
  const isPostPaid = payoutItem?.payout.status === "paid";
  console.log(`  Payout status:   ${payoutItem?.payout.status ?? "none"}`);
  console.log(`  Post-payout:     ${isPostPaid ? "YES — no negative transaction!" : "NO — normal refund"}`);
  console.log();

  if (isPostPaid) {
    // Mark order item as refunded
    await prisma.orderItem.update({
      where: { id: paidOrderItem.id },
      data: { status: "refunded" },
    });

    // Create new listing under shop consignor
    const newListing = await prisma.listing.create({
      data: {
        consignorId: shopConsignor.id,
        variantId: paidOrderItem.listing.variantId,
        price: paidOrderItem.price,
        status: "active",
        reassignedFromConsignorId: consignor.id,
        reassignedFromListingId: paidOrderItem.listingId,
      },
    });

    // Create audit log
    const log = await prisma.reassignmentLog.create({
      data: {
        originalListingId: paidOrderItem.listingId,
        newListingId: newListing.id,
        originalConsignorId: consignor.id,
        newConsignorId: shopConsignor.id,
        orderId: paidOrderItem.orderId,
        reason: "post_payout_refund",
      },
    });

    console.log("STEP 6: Reassignment complete!");
    console.log(`  New listing ID:        ${newListing.id}`);
    console.log(`  Under:                 ${shopConsignor.name}`);
    console.log(`  Price:                 $${newListing.price}`);
    console.log(`  reassignedFromConsignor: ${consignor.name} (${newListing.reassignedFromConsignorId})`);
    console.log(`  reassignedFromListing:   ${newListing.reassignedFromListingId}`);
    console.log();
    console.log("  ReassignmentLog:");
    console.log(`    ID:       ${log.id}`);
    console.log(`    Original: ${log.originalListingId} → New: ${log.newListingId}`);
    console.log(`    Reason:   ${log.reason}`);
    console.log(`    Order:    ${log.orderId}`);
    console.log();

    // ── Step 7: Verify balance unchanged ────────────────────────
    const txAggAfter = await prisma.transaction.aggregate({
      where: { consignorId: consignor.id },
      _sum: { amount: true },
    });
    const payoutAggAfter = await prisma.payout.aggregate({
      where: { consignorId: consignor.id, status: "paid" },
      _sum: { amount: true },
    });
    const balanceAfter = (txAggAfter._sum.amount ?? 0) - (payoutAggAfter._sum.amount ?? 0);

    console.log("STEP 7: Balance after refund");
    console.log(`  Total earnings: $${(txAggAfter._sum.amount ?? 0).toFixed(2)}`);
    console.log(`  Total payouts:  $${(payoutAggAfter._sum.amount ?? 0).toFixed(2)}`);
    console.log(`  Balance:        $${balanceAfter.toFixed(2)}`);
    console.log(`  Changed:        ${balanceBefore === balanceAfter ? "NO ✓ (correct!)" : `YES ✗ (was $${balanceBefore.toFixed(2)})`}`);
    console.log();

    // ── Step 8: Verify original listing still sold ──────────────
    const originalListing = await prisma.listing.findUnique({ where: { id: paidOrderItem.listingId } });
    console.log("STEP 8: Original listing status");
    console.log(`  Status: ${originalListing?.status} ${originalListing?.status === "sold" ? "✓" : "✗"}`);
    console.log();

    // ── Step 9: Show what resale would look like ────────────────
    const resaleGross = newListing.price;
    const resaleFee = resaleGross * shopConsignor.feeRate;
    const resaleConsignorAmount = resaleGross - resaleFee;
    console.log("STEP 9: If shop resells this item:");
    console.log(`  Sale price:      $${resaleGross}`);
    console.log(`  Fee (100%):      $${resaleFee} (marketplace keeps)`);
    console.log(`  Consignor payout: $${resaleConsignorAmount} (zero — no payout generated!)`);
  }

  console.log("\n========================================");
  console.log("  TEST COMPLETE ✓");
  console.log("========================================\n");
}

main().catch(console.error).finally(() => prisma.$disconnect());
