import prisma from "~/db.server";

type FeedEvent = {
  event: string;
  time: string;
  type: "sale" | "listing" | "request" | "approval";
};

function relativeTime(now: Date, then: Date): string {
  const diffMs = now.getTime() - then.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export async function getDashboardData() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [salesAgg, totalOrders, commissionAgg, inventoryAgg, submittedCount, awaitingDropoffCount, withdrawalRequestCount] = await Promise.all([
    prisma.transaction.aggregate({ where: { type: "sale" }, _sum: { grossAmount: true } }),
    prisma.order.count(),
    prisma.transaction.aggregate({ where: { type: "sale" }, _sum: { feeAmount: true } }),
    prisma.listing.aggregate({ where: { status: "active" }, _sum: { price: true } }),
    prisma.listing.count({ where: { status: "submitted" } }),
    prisma.listing.count({ where: { status: "approved_awaiting_dropoff" } }),
    prisma.listing.count({ where: { status: "withdrawal_requested" } }),
  ]);

  const totalSales = salesAgg._sum.grossAmount ?? 0;
  const totalCommission = commissionAgg._sum.feeAmount ?? 0;
  const inventoryValue = inventoryAgg._sum.price ?? 0;

  // Activity feed: recent events from listings + refund transactions
  const [recentListings, refundTxs] = await Promise.all([
    prisma.listing.findMany({
      take: 30,
      orderBy: { createdAt: "desc" },
      include: {
        consignor: true,
        variant: { include: { product: true } },
      },
    }),
    prisma.transaction.findMany({
      where: { type: "refund" },
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        orderItem: {
          include: {
            listing: {
              include: {
                variant: { include: { product: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const activityFeed = await getActivityFeed(15);

  return {
    totalSales,
    totalOrders,
    totalCommission,
    inventoryValue,
    submittedCount,
    awaitingDropoffCount,
    withdrawalRequestCount,
    updatedAt: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
    activityFeed,
  };
}

/**
 * Build activity feed from recent listings + refund transactions.
 * @param limit Max events to return. Pass 0 for unlimited.
 */
export async function getActivityFeed(limit = 15): Promise<FeedEvent[]> {
  const take = limit === 0 ? 500 : limit * 3;
  const [recentListings, refundTxs] = await Promise.all([
    prisma.listing.findMany({
      take,
      orderBy: { createdAt: "desc" },
      include: {
        consignor: true,
        variant: { include: { product: true } },
      },
    }),
    prisma.transaction.findMany({
      where: { type: "refund" },
      take: Math.max(Math.floor(take / 3), 10),
      orderBy: { createdAt: "desc" },
      include: {
        orderItem: {
          include: {
            listing: {
              include: {
                variant: { include: { product: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const now = new Date();
  type SortableFeedEvent = FeedEvent & { sortTime: number };
  const events: SortableFeedEvent[] = [];

  for (const listing of recentListings) {
    const product = listing.variant.product.title;
    const size = listing.variant.size;

    if (listing.status === "sold" && listing.soldAt) {
      events.push({
        event: `${product} (${size}) sold for $${listing.price.toFixed(2)}`,
        time: relativeTime(now, listing.soldAt),
        type: "sale",
        sortTime: listing.soldAt.getTime(),
      });
    }

    if (listing.status === "pending_sale" && listing.soldAt) {
      events.push({
        event: `${product} (${size}) ordered, awaiting payment`,
        time: relativeTime(now, listing.soldAt),
        type: "request",
        sortTime: listing.soldAt.getTime(),
      });
    }

    events.push({
      event: `${listing.consignor.name} listed ${product} (${size}) at $${listing.price.toFixed(2)}`,
      time: relativeTime(now, listing.createdAt),
      type: "listing",
      sortTime: listing.createdAt.getTime(),
    });
  }

  for (const tx of refundTxs) {
    if (!tx.orderItem) continue;
    const listing = tx.orderItem.listing;
    const product = listing.variant.product.title;
    const size = listing.variant.size;
    events.push({
      event: `${product} (${size}) refunded $${Math.abs(tx.grossAmount).toFixed(2)}`,
      time: relativeTime(now, tx.createdAt),
      type: "request",
      sortTime: tx.createdAt.getTime(),
    });
  }

  events.sort((a, b) => b.sortTime - a.sortTime);
  if (limit === 0) return events.map(({ event, time, type }) => ({ event, time, type }));
  return events.slice(0, limit).map(({ event, time, type }) => ({ event, time, type }));
}
