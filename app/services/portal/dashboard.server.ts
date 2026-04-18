import prisma from "~/db.server";
import { getConsignorBalance, getConsignorPaidTotal } from "~/services/orders.server";
import { buildNotifications } from "./notifications.server";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { PAYOUT_STATUS } from "~/lib/payout-statuses";
import { TRANSACTION_TYPE } from "~/lib/order-statuses";

interface MonthlyEarning {
  month: string;
  value: number;
}

interface ListingStatusCount {
  label: string;
  value: number;
  max: number;
  color: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-primary",
  pending_sale: "bg-[hsl(var(--warning))]",
  sold: "bg-[hsl(var(--success))]",
  cancelled: "bg-red-500/70",
  withdrawal_requested: "bg-orange-500/70",
  pending_pickup: "bg-cyan-500/70",
  withdrawn: "bg-muted-foreground/70",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending_sale: "Pending Sale",
  sold: "Sold",
  cancelled: "Cancelled",
  withdrawal_requested: "Withdrawal Requested",
  pending_pickup: "Pending Pickup",
  withdrawn: "Withdrawn",
};

function getMonthlyEarnings(
  transactions: { createdAt: Date; consignorAmount: number; grossAmount: number; salePrice?: number; cost?: number }[],
  storeOwned = false,
): MonthlyEarning[] {
  const now = new Date();
  const months: MonthlyEarning[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString("en-US", { month: "short" });
    months.push({ month: label, value: 0 });
  }

  for (const tx of transactions) {
    const txDate = new Date(tx.createdAt);
    const monthsDiff =
      (now.getFullYear() - txDate.getFullYear()) * 12 +
      (now.getMonth() - txDate.getMonth());
    if (monthsDiff >= 0 && monthsDiff < 6) {
      let value: number;
      if (storeOwned) {
        // Refund txs have positive salePrice/cost but negative grossAmount
        // Use grossAmount sign to determine direction
        const isRefund = tx.grossAmount < 0;
        const profit = (tx.salePrice ?? 0) - (tx.cost ?? 0);
        value = isRefund ? -profit : profit;
      } else {
        // consignorAmount is already negative for refunds
        value = tx.consignorAmount;
      }
      months[5 - monthsDiff].value += value;
    }
  }

  return months.map((m) => ({
    ...m,
    value: Math.round(m.value * 100) / 100,
  }));
}

export async function getConsignorDashboard(consignorId: string, opts: { storeOwned?: boolean } = {}) {
  const storeOwned = opts.storeOwned ?? false;
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [
    pendingPayouts,
    paidTotal,
    activeCount,
    soldCount,
    awaitingInvoiceAgg,
    invoiceSentAgg,
    unbatchedAgg,
    recentSales,
    earningsTransactions,
    listingsByStatus,
    recentPayouts,
    // Store-owned: profit-based total earnings
    storeOwnedProfitAgg,
    inventoryValueAgg,
    totalSalesRevenueAgg,
  ] = await Promise.all([
    storeOwned ? Promise.resolve(0) : getConsignorBalance(consignorId),
    storeOwned ? Promise.resolve(0) : getConsignorPaidTotal(consignorId),

    prisma.listing.count({
      where: { consignorId, status: LISTING_STATUS.ACTIVE },
    }),

    prisma.listing.count({
      where: { consignorId, status: LISTING_STATUS.SOLD },
    }),

    // Payout breakdown: awaiting invoice (status=pending)
    storeOwned
      ? Promise.resolve({ _sum: { amount: null } })
      : prisma.payout.aggregate({
          where: { consignorId, status: PAYOUT_STATUS.PENDING },
          _sum: { amount: true },
        }),

    // Payout breakdown: invoice sent (status=invoiced)
    storeOwned
      ? Promise.resolve({ _sum: { amount: null } })
      : prisma.payout.aggregate({
          where: { consignorId, status: PAYOUT_STATUS.INVOICED },
          _sum: { amount: true },
        }),

    // Payout breakdown: unbatched (sale txs not in any payout)
    storeOwned
      ? Promise.resolve({ _sum: { consignorAmount: null } })
      : prisma.transaction.aggregate({
          where: { consignorId, type: TRANSACTION_TYPE.SALE, payoutItems: { none: {} } },
          _sum: { consignorAmount: true },
        }),

    // Recent sales: only show non-refunded items
    prisma.transaction.findMany({
      where: { consignorId, type: TRANSACTION_TYPE.SALE, orderItem: { status: "sold" } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        orderItem: {
          include: {
            listing: {
              include: { variant: { include: { product: true } } },
            },
            order: true,
          },
        },
      },
    }),

    // Performance chart: include sale + refund/void txs so refunds offset sales
    prisma.transaction.findMany({
      where: { consignorId, type: { in: [TRANSACTION_TYPE.SALE, TRANSACTION_TYPE.REFUND, "void"] }, createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true, consignorAmount: true, grossAmount: true, salePrice: true, cost: true },
    }),

    prisma.listing.groupBy({
      by: ["status"],
      where: { consignorId },
      _count: true,
    }),

    storeOwned
      ? Promise.resolve([])
      : prisma.payout.findMany({
          where: { consignorId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, createdAt: true, amount: true, status: true },
        }),

    // Store-owned: sum of (salePrice - cost) for sold items = total profit
    storeOwned
      ? prisma.transaction.aggregate({
          where: { consignorId, type: TRANSACTION_TYPE.SALE, orderItem: { status: "sold" } },
          _sum: { salePrice: true, cost: true },
        })
      : Promise.resolve({ _sum: { salePrice: null, cost: null } }),

    // Inventory value: sum of prices for active listings
    prisma.listing.aggregate({
      where: { consignorId, status: LISTING_STATUS.ACTIVE },
      _sum: { price: true },
    }),

    // Total sales revenue (for regular consignors): sum of salePrice from sold transactions
    storeOwned
      ? Promise.resolve({ _sum: { salePrice: null } })
      : prisma.transaction.aggregate({
          where: { consignorId, type: TRANSACTION_TYPE.SALE, orderItem: { status: "sold" } },
          _sum: { salePrice: true },
        }),
  ]);

  return buildDashboardResponse({
    storeOwned, paidTotal, activeCount, soldCount, pendingPayouts,
    awaitingInvoiceAgg, invoiceSentAgg, unbatchedAgg,
    recentSales, earningsTransactions, listingsByStatus, recentPayouts,
    storeOwnedProfitAgg, inventoryValueAgg, totalSalesRevenueAgg,
  });
}

// ── Transform raw query results into dashboard response ──

function buildDashboardResponse({
  storeOwned, paidTotal, activeCount, soldCount, pendingPayouts,
  awaitingInvoiceAgg, invoiceSentAgg, unbatchedAgg,
  recentSales, earningsTransactions, listingsByStatus, recentPayouts,
  storeOwnedProfitAgg, inventoryValueAgg, totalSalesRevenueAgg,
}: {
  storeOwned: boolean;
  paidTotal: number;
  activeCount: number;
  soldCount: number;
  pendingPayouts: number;
  awaitingInvoiceAgg: { _sum: { amount: number | null } };
  invoiceSentAgg: { _sum: { amount: number | null } };
  unbatchedAgg: { _sum: { consignorAmount: number | null } };
  recentSales: Array<{ id: string; createdAt: Date; consignorAmount: number; salePrice: number; cost: number; feeAmount: number; orderItem: { listing: { variant: { size: string; product: { title: string } } }; order: { orderNumber: string | null } } | null }>;
  earningsTransactions: Array<{ createdAt: Date; consignorAmount: number; grossAmount: number; salePrice: number; cost: number }>;
  listingsByStatus: Array<{ status: string; _count: number }>;
  recentPayouts: Array<{ id: string; createdAt: Date; amount: number; status: string }>;
  storeOwnedProfitAgg: { _sum: { salePrice: number | null; cost: number | null } };
  inventoryValueAgg: { _sum: { price: number | null } };
  totalSalesRevenueAgg: { _sum: { salePrice: number | null } };
}) {
  const monthlyEarnings = getMonthlyEarnings(earningsTransactions, storeOwned);
  const currentMonthEarnings = monthlyEarnings[monthlyEarnings.length - 1]?.value ?? 0;

  const totalListings = listingsByStatus.reduce((sum, g) => sum + g._count, 0);
  const listingStatusCounts: ListingStatusCount[] = listingsByStatus
    .filter((g) => STATUS_LABELS[g.status])
    .map((g) => ({
      label: STATUS_LABELS[g.status],
      value: g._count,
      max: totalListings,
      color: STATUS_COLORS[g.status] ?? "bg-muted",
    }))
    .sort((a, b) => b.value - a.value);

  const recentSaleNotifs = recentSales.slice(0, 5).map((tx) => ({
    id: tx.id,
    createdAt: tx.createdAt,
    product: tx.orderItem?.listing.variant.product.title ?? "Unknown",
    consignorAmount: tx.consignorAmount,
  }));
  const notifications = buildNotifications(recentSaleNotifs, recentPayouts);

  // Store-owned: totalEarnings = profit (revenue - cost), no pending payouts
  const totalEarnings = storeOwned
    ? (storeOwnedProfitAgg._sum.salePrice ?? 0) - (storeOwnedProfitAgg._sum.cost ?? 0)
    : paidTotal;

  const totalRevenue = storeOwned ? (storeOwnedProfitAgg._sum.salePrice ?? 0) : undefined;
  const totalCost = storeOwned ? (storeOwnedProfitAgg._sum.cost ?? 0) : undefined;
  const inventoryValue = inventoryValueAgg._sum.price ?? 0;
  const totalSalesRevenue = storeOwned ? 0 : (totalSalesRevenueAgg._sum.salePrice ?? 0);

  return {
    storeOwned,
    stats: {
      totalEarnings,
      activeListings: activeCount,
      itemsSold: soldCount,
      pendingPayouts: storeOwned ? null : pendingPayouts,
      inventoryValue,
      totalSalesRevenue,
      totalRevenue,
      totalCost,
    },
    payoutBreakdown: {
      awaitingInvoice: awaitingInvoiceAgg._sum.amount ?? 0,
      invoiceSent: invoiceSentAgg._sum.amount ?? 0,
      unbatched: unbatchedAgg._sum.consignorAmount ?? 0,
    },
    monthlyEarnings,
    currentMonthEarnings,
    listingStatusCounts,
    notifications,
    recentSales: recentSales.map((tx) => ({
      id: tx.id,
      product: tx.orderItem?.listing.variant.product.title ?? "Unknown",
      size: tx.orderItem?.listing.variant.size ?? "",
      orderNumber: tx.orderItem?.order.orderNumber ?? "",
      salePrice: tx.salePrice,
      cost: tx.cost,
      fee: tx.feeAmount,
      payout: tx.consignorAmount,
      profit: tx.salePrice - tx.cost,
      date: tx.createdAt,
    })),
  };
}
