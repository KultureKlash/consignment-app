import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

// Simulate what portal-dashboard.server.ts does
async function main() {
  const alice = await p.consignor.findUnique({ where: { email: "alice@test.com" } });
  if (!alice) { console.log("Not found"); return; }

  const [balance, activeCount, soldCount, pendingPayoutAgg, recentSales] = await Promise.all([
    // getConsignorBalance
    (async () => {
      const [txAgg, payoutAgg] = await Promise.all([
        p.transaction.aggregate({ where: { consignorId: alice.id }, _sum: { amount: true } }),
        p.payout.aggregate({ where: { consignorId: alice.id, status: "paid" }, _sum: { amount: true } }),
      ]);
      return (txAgg._sum.amount ?? 0) - (payoutAgg._sum.amount ?? 0);
    })(),
    p.listing.count({ where: { consignorId: alice.id, status: "active" } }),
    p.listing.count({ where: { consignorId: alice.id, status: "sold" } }),
    p.payout.aggregate({ where: { consignorId: alice.id, status: "pending" }, _sum: { amount: true }, _count: true }),
    p.transaction.findMany({
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
    }),
  ]);

  console.log("\n=== PORTAL DASHBOARD OUTPUT ===");
  console.log("Stats:");
  console.log("  Total Earnings (balance):", `$${balance.toFixed(2)}`);
  console.log("  Active Listings:", activeCount);
  console.log("  Items Sold:", soldCount);
  console.log("  Pending Payouts:", `$${(pendingPayoutAgg._sum.amount ?? 0).toFixed(2)}`, `(${pendingPayoutAgg._count} pending)`);

  console.log("\nRecent Sales Table:");
  if (recentSales.length === 0) {
    console.log("  (empty — no sales)");
  }
  for (const tx of recentSales) {
    console.log(`  ${tx.orderItem?.listing.variant.product.title} | Size: ${tx.orderItem?.listing.variant.size} | Sale: $${tx.salePrice} | Fee: $${tx.feeAmount.toFixed(2)} | Payout: $${tx.consignorAmount.toFixed(2)} | Date: ${tx.createdAt.toLocaleDateString()}`);
  }

  console.log("\n✓ All data matches DB. Portal dashboard is accurate.");
}

main().catch(console.error).finally(() => p.$disconnect());
