import prisma from "~/db.server";
import { getConsignorBalance } from "~/services/orders.server";

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

export interface PortalNotification {
  id: string;
  type: string;
  title: string;
  description: string;
  time: Date;
  color: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-primary",
  pending_sale: "bg-[hsl(var(--warning))]",
  sold: "bg-[hsl(var(--success))]",
  cancelled: "bg-red-500/70",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending_sale: "Pending Sale",
  sold: "Sold",
  cancelled: "Cancelled",
};

function getMonthlyEarnings(
  transactions: { createdAt: Date; consignorAmount: number }[]
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
      months[5 - monthsDiff].value += tx.consignorAmount;
    }
  }

  return months.map((m) => ({
    ...m,
    value: Math.round(m.value * 100) / 100,
  }));
}

function buildNotifications(
  sales: { id: string; createdAt: Date; product: string; consignorAmount: number }[],
  payouts: { id: string; createdAt: Date; amount: number; status: string }[]
): PortalNotification[] {
  const notifications: PortalNotification[] = [];

  for (const sale of sales) {
    notifications.push({
      id: `sale-${sale.id}`,
      type: "sale",
      title: "Item Sold",
      description: `${sale.product} sold for $${sale.consignorAmount.toFixed(2)}`,
      time: sale.createdAt,
      color: "text-[hsl(var(--success))]",
    });
  }

  for (const payout of payouts) {
    notifications.push({
      id: `payout-${payout.id}`,
      type: "payout",
      title: payout.status === "paid" ? "Payout Received" : "Payout Pending",
      description: `$${payout.amount.toFixed(2)} ${payout.status === "paid" ? "paid out" : "pending"}`,
      time: payout.createdAt,
      color: payout.status === "paid" ? "text-primary" : "text-[hsl(var(--warning))]",
    });
  }

  notifications.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return notifications.slice(0, 10);
}

export async function getConsignorNotifications(
  consignorId: string,
  notificationsReadAt: Date | null,
): Promise<{
  items: PortalNotification[];
  unreadCount: number;
}> {
  const [recentSales, recentPayouts] = await Promise.all([
    prisma.transaction.findMany({
      where: { consignorId, type: "sale" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        orderItem: {
          include: {
            listing: {
              include: { variant: { include: { product: true } } },
            },
          },
        },
      },
    }),
    prisma.payout.findMany({
      where: { consignorId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, createdAt: true, amount: true, status: true },
    }),
  ]);

  const saleNotifs = recentSales.map((tx) => ({
    id: tx.id,
    createdAt: tx.createdAt,
    product: tx.orderItem?.listing.variant.product.title ?? "Unknown",
    consignorAmount: tx.consignorAmount,
  }));

  const items = buildNotifications(saleNotifs, recentPayouts);
  const unreadCount = notificationsReadAt
    ? items.filter((item) => new Date(item.time) > notificationsReadAt).length
    : items.length;
  return { items, unreadCount };
}

export async function getConsignorDashboard(consignorId: string) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [
    balance,
    activeCount,
    soldCount,
    pendingPayoutAgg,
    recentSales,
    earningsTransactions,
    listingsByStatus,
    recentPayouts,
  ] = await Promise.all([
    getConsignorBalance(consignorId),

    prisma.listing.count({
      where: { consignorId, status: "active" },
    }),

    prisma.listing.count({
      where: { consignorId, status: "sold" },
    }),

    prisma.payout.aggregate({
      where: { consignorId, status: "pending" },
      _sum: { amount: true },
      _count: true,
    }),

    prisma.transaction.findMany({
      where: { consignorId, type: "sale" },
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

    prisma.transaction.findMany({
      where: { consignorId, type: "sale", createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true, consignorAmount: true },
    }),

    prisma.listing.groupBy({
      by: ["status"],
      where: { consignorId },
      _count: true,
    }),

    prisma.payout.findMany({
      where: { consignorId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, createdAt: true, amount: true, status: true },
    }),
  ]);

  const monthlyEarnings = getMonthlyEarnings(earningsTransactions);
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

  return {
    stats: {
      balance,
      activeListings: activeCount,
      itemsSold: soldCount,
      pendingPayouts: pendingPayoutAgg._sum.amount ?? 0,
      pendingPayoutCount: pendingPayoutAgg._count ?? 0,
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
      fee: tx.feeAmount,
      payout: tx.consignorAmount,
      date: tx.createdAt,
    })),
  };
}
