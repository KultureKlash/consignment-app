import prisma from "~/db.server";
import { fmt } from "~/lib/currency";
import { LISTING_STATUS } from "~/lib/listing-statuses";

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

  const [salesAgg, totalOrders, consignFeesAgg, storeAgg, inventoryAgg, submittedCount, awaitingDropoffCount, withdrawalRequestCount, pendingPickupCount] = await Promise.all([
    prisma.transaction.aggregate({ where: { type: "sale" }, _sum: { grossAmount: true } }),
    prisma.order.count(),
    prisma.transaction.aggregate({ where: { type: "sale", consignor: { storeOwned: false } }, _sum: { feeAmount: true } }),
    prisma.transaction.aggregate({ where: { type: "sale", consignor: { storeOwned: true } }, _sum: { grossAmount: true, cost: true } }),
    prisma.listing.aggregate({ where: { status: LISTING_STATUS.ACTIVE }, _sum: { price: true } }),
    prisma.listing.count({ where: { status: LISTING_STATUS.SUBMITTED } }),
    prisma.listing.count({ where: { status: LISTING_STATUS.APPROVED } }),
    prisma.listing.count({ where: { status: LISTING_STATUS.WITHDRAWAL_REQUESTED } }),
    prisma.listing.count({ where: { status: LISTING_STATUS.PENDING_PICKUP } }),
  ]);

  const totalSales = salesAgg._sum.grossAmount ?? 0;
  const consignmentFees = consignFeesAgg._sum.feeAmount ?? 0;
  const storeProfit = (storeAgg._sum.grossAmount ?? 0) - (storeAgg._sum.cost ?? 0);
  const totalEarnings = consignmentFees + storeProfit;
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
    consignmentFees,
    storeProfit,
    totalEarnings,
    inventoryValue,
    submittedCount,
    awaitingDropoffCount,
    withdrawalRequestCount,
    pendingPickupCount,
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

    if (listing.status === LISTING_STATUS.SOLD && listing.soldAt) {
      events.push({
        event: `${product} (${size}) sold for $${fmt(listing.price)}`,
        time: relativeTime(now, listing.soldAt),
        type: "sale",
        sortTime: listing.soldAt.getTime(),
      });
    }

    if (listing.status === LISTING_STATUS.PENDING_SALE && listing.soldAt) {
      events.push({
        event: `${product} (${size}) ordered, awaiting payment`,
        time: relativeTime(now, listing.soldAt),
        type: "request",
        sortTime: listing.soldAt.getTime(),
      });
    }

    events.push({
      event: `${listing.consignor.name} listed ${product} (${size}) at $${fmt(listing.price)}`,
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
      event: `${product} (${size}) refunded $${fmt(Math.abs(tx.grossAmount))}`,
      time: relativeTime(now, tx.createdAt),
      type: "request",
      sortTime: tx.createdAt.getTime(),
    });
  }

  events.sort((a, b) => b.sortTime - a.sortTime);
  if (limit === 0) return events.map(({ event, time, type }) => ({ event, time, type }));
  return events.slice(0, limit).map(({ event, time, type }) => ({ event, time, type }));
}
