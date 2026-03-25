import prisma from "~/db.server";
import { getConsignorBalance, getConsignorPaidTotal } from "~/services/orders.server";

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
  payouts: { id: string; createdAt: Date; amount: number; status: string }[],
  rejections: { id: string; rejectedAt: Date; product: string; size: string; reason: string }[] = [],
  approvals: { id: string; approvedAt: Date; product: string; size: string }[] = [],
  withdrawals: { id: string; time: Date; product: string; size: string; type: "withdrawal_requested" | "pickup_ready" | "withdrawn" }[] = [],
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

  for (const r of rejections) {
    notifications.push({
      id: `rejected-${r.id}`,
      type: "rejected",
      title: "Listing Rejected",
      description: `${r.product} (${r.size}) — ${r.reason}`,
      time: r.rejectedAt,
      color: "text-red-400",
    });
  }

  for (const a of approvals) {
    notifications.push({
      id: `approved-${a.id}`,
      type: "approved",
      title: "Listing Approved",
      description: `${a.product} (${a.size}) — ready for drop-off`,
      time: a.approvedAt,
      color: "text-teal-400",
    });
  }

  for (const w of withdrawals) {
    const titles: Record<string, string> = {
      withdrawal_requested: "Withdrawal Submitted",
      pickup_ready: "Ready for Pickup",
      withdrawn: "Withdrawal Complete",
    };
    const descriptions: Record<string, string> = {
      withdrawal_requested: `${w.product} (${w.size}) — withdrawal request sent`,
      pickup_ready: `${w.product} (${w.size}) — approved, come pick up your item`,
      withdrawn: `${w.product} (${w.size}) — picked up`,
    };
    const colors: Record<string, string> = {
      withdrawal_requested: "text-orange-400",
      pickup_ready: "text-cyan-400",
      withdrawn: "text-muted-foreground",
    };
    notifications.push({
      id: `${w.type}-${w.id}`,
      type: w.type,
      title: titles[w.type],
      description: descriptions[w.type],
      time: w.time,
      color: colors[w.type],
    });
  }

  notifications.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return notifications.slice(0, 20);
}

export async function getConsignorNotifications(
  consignorId: string,
  notificationsReadAt: Date | null,
): Promise<{
  items: PortalNotification[];
  unreadCount: number;
}> {
  const [recentSales, recentPayouts, recentRejections, recentApprovals, withdrawalListings] = await Promise.all([
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
    prisma.listing.findMany({
      where: { consignorId, status: "rejected", rejectedAt: { not: null } },
      orderBy: { rejectedAt: "desc" },
      take: 10,
      include: { variant: { include: { product: true } } },
    }),
    prisma.listing.findMany({
      where: { consignorId, status: "approved_awaiting_dropoff", approvedAt: { not: null } },
      orderBy: { approvedAt: "desc" },
      take: 10,
      include: { variant: { include: { product: true } } },
    }),
    // All withdrawal-related listings (covers all 3 statuses)
    prisma.listing.findMany({
      where: { consignorId, status: { in: ["withdrawal_requested", "pending_pickup", "withdrawn"] }, withdrawnAt: { not: null } },
      orderBy: { withdrawnAt: "desc" },
      take: 10,
      include: { variant: { include: { product: true } } },
    }),
  ]);

  const saleNotifs = recentSales.map((tx) => ({
    id: tx.id,
    createdAt: tx.createdAt,
    product: tx.orderItem?.listing.variant.product.title ?? "Unknown",
    consignorAmount: tx.consignorAmount,
  }));

  const rejectionNotifs = recentRejections.map((l) => ({
    id: l.id,
    rejectedAt: l.rejectedAt!,
    product: l.variant.product.title,
    size: l.variant.size,
    reason: l.rejectionReason ?? "No reason provided",
  }));

  const approvalNotifs = recentApprovals.map((l) => ({
    id: l.id,
    approvedAt: l.approvedAt!,
    product: l.variant.product.title,
    size: l.variant.size,
  }));

  // Build withdrawal notifications — each listing generates a notification for its current step
  // plus any earlier steps it has passed through
  const withdrawalNotifs: { id: string; time: Date; product: string; size: string; type: "withdrawal_requested" | "pickup_ready" | "withdrawn" }[] = [];

  for (const l of withdrawalListings) {
    // Step 1: withdrawal requested (always present for these statuses)
    withdrawalNotifs.push({
      id: l.id,
      time: l.withdrawnAt!,
      product: l.variant.product.title,
      size: l.variant.size,
      type: "withdrawal_requested",
    });

    // Step 2: pickup ready (pending_pickup or withdrawn have been approved)
    if (l.status === "pending_pickup" || l.status === "withdrawn") {
      withdrawalNotifs.push({
        id: l.id,
        // Use withdrawnAt + 1ms offset so it sorts after the request notification
        time: new Date((l.withdrawnAt as Date).getTime() + 1000),
        product: l.variant.product.title,
        size: l.variant.size,
        type: "pickup_ready",
      });
    }

    // Step 3: withdrawn (final state)
    if (l.status === "withdrawn") {
      withdrawalNotifs.push({
        id: l.id,
        time: new Date((l.withdrawnAt as Date).getTime() + 2000),
        product: l.variant.product.title,
        size: l.variant.size,
        type: "withdrawn",
      });
    }
  }

  const items = buildNotifications(saleNotifs, recentPayouts, rejectionNotifs, approvalNotifs, withdrawalNotifs);
  const unreadCount = notificationsReadAt
    ? items.filter((item) => new Date(item.time) > notificationsReadAt).length
    : items.length;
  return { items, unreadCount };
}

export async function getConsignorDashboard(consignorId: string) {
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
  ] = await Promise.all([
    getConsignorBalance(consignorId),
    getConsignorPaidTotal(consignorId),

    prisma.listing.count({
      where: { consignorId, status: "active" },
    }),

    prisma.listing.count({
      where: { consignorId, status: "sold" },
    }),

    // Payout breakdown: awaiting invoice (status=pending)
    prisma.payout.aggregate({
      where: { consignorId, status: "pending" },
      _sum: { amount: true },
    }),

    // Payout breakdown: invoice sent (status=invoiced)
    prisma.payout.aggregate({
      where: { consignorId, status: "invoiced" },
      _sum: { amount: true },
    }),

    // Payout breakdown: unbatched (sale txs not in any payout)
    prisma.transaction.aggregate({
      where: { consignorId, type: "sale", payoutItems: { none: {} } },
      _sum: { consignorAmount: true },
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
      totalEarnings: paidTotal,
      activeListings: activeCount,
      itemsSold: soldCount,
      pendingPayouts,
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
      fee: tx.feeAmount,
      payout: tx.consignorAmount,
      date: tx.createdAt,
    })),
  };
}

export async function getConsignorPayouts(consignorId: string) {
  const payouts = await prisma.payout.findMany({
    where: { consignorId },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          transaction: {
            include: {
              orderItem: {
                include: {
                  order: true,
                  listing: {
                    include: { variant: { include: { product: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Unbatched sale transactions (not in any payout yet)
  const unbatchedTxs = await prisma.transaction.findMany({
    where: { consignorId, type: "sale", payoutItems: { none: {} } },
    orderBy: { createdAt: "desc" },
    include: {
      orderItem: {
        include: {
          order: true,
          listing: {
            include: { variant: { include: { product: true } } },
          },
        },
      },
    },
  });

  return { payouts, unbatchedTxs };
}
