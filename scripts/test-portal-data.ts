import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  // All consignors
  const consignors = await p.consignor.findMany({
    select: { id: true, name: true, email: true, feeRate: true },
  });
  console.log("\n=== ALL CONSIGNORS ===");
  for (const c of consignors) {
    console.log(`  ${c.name} (${c.email}) — fee: ${c.feeRate}`);
  }

  // Pick Alice
  const alice = consignors.find((c) => c.email === "alice@test.com");
  if (!alice) {
    console.log("Alice not found!");
    return;
  }

  console.log(`\n=== ALICE DASHBOARD DATA ===`);

  // Active listings
  const active = await p.listing.count({ where: { consignorId: alice.id, status: "active" } });
  console.log("Active listings:", active);

  // Sold
  const sold = await p.listing.count({ where: { consignorId: alice.id, status: "sold" } });
  console.log("Sold listings:", sold);

  // Pending sale
  const pendingSale = await p.listing.count({ where: { consignorId: alice.id, status: "pending_sale" } });
  console.log("Pending sale:", pendingSale);

  // Cancelled
  const cancelled = await p.listing.count({ where: { consignorId: alice.id, status: "cancelled" } });
  console.log("Cancelled:", cancelled);

  // Transactions
  const txs = await p.transaction.findMany({
    where: { consignorId: alice.id },
    orderBy: { createdAt: "desc" },
    include: {
      orderItem: {
        include: {
          listing: { include: { variant: { include: { product: true } } } },
          order: true,
        },
      },
    },
  });
  console.log("\nTransactions:", txs.length);
  for (const tx of txs) {
    const prod = tx.orderItem?.listing.variant.product.title ?? "?";
    const size = tx.orderItem?.listing.variant.size ?? "?";
    const order = tx.orderItem?.order.orderNumber ?? "?";
    console.log(
      ` [${tx.type}] ${prod} (${size}) — order: ${order}, sale: $${tx.salePrice}, fee: $${tx.feeAmount.toFixed(2)}, payout: $${tx.consignorAmount.toFixed(2)}, net: $${tx.amount.toFixed(2)}`
    );
  }

  // Balance
  const txAgg = await p.transaction.aggregate({
    where: { consignorId: alice.id },
    _sum: { amount: true },
  });
  const payoutAgg = await p.payout.aggregate({
    where: { consignorId: alice.id, status: "paid" },
    _sum: { amount: true },
  });
  const balance = (txAgg._sum.amount ?? 0) - (payoutAgg._sum.amount ?? 0);
  console.log("\nTotal earnings (sum tx):", txAgg._sum.amount ?? 0);
  console.log("Total paid payouts:", payoutAgg._sum.amount ?? 0);
  console.log("Balance:", balance);

  // Pending payouts
  const pendingPayout = await p.payout.aggregate({
    where: { consignorId: alice.id, status: "pending" },
    _sum: { amount: true },
    _count: true,
  });
  console.log("Pending payouts:", pendingPayout._count, "— amount:", pendingPayout._sum.amount ?? 0);

  // Recent sales (what dashboard shows)
  const recentSales = await p.transaction.findMany({
    where: { consignorId: alice.id, type: "sale" },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      orderItem: {
        include: {
          listing: { include: { variant: { include: { product: true } } } },
          order: true,
        },
      },
    },
  });
  console.log("\nRecent sales (dashboard table):");
  for (const tx of recentSales) {
    const prod = tx.orderItem?.listing.variant.product.title ?? "?";
    const size = tx.orderItem?.listing.variant.size ?? "?";
    console.log(
      `  ${prod} (${size}) — $${tx.salePrice} → fee $${tx.feeAmount.toFixed(2)}, payout $${tx.consignorAmount.toFixed(2)}`
    );
  }

  // Cross-check: admin consignor page data
  console.log("\n=== ADMIN CROSS-CHECK ===");
  const allListings = await p.listing.groupBy({
    by: ["status"],
    where: { consignorId: alice.id },
    _count: true,
  });
  console.log("Listing counts by status:");
  for (const g of allListings) {
    console.log(`  ${g.status}: ${g._count}`);
  }
}

main().catch(console.error).finally(() => p.$disconnect());
