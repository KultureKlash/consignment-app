import prisma from "~/db.server";
import { fmt } from "~/lib/formatting";
import { LISTING_STATUS } from "~/lib/domain";
import { TRANSACTION_TYPE, ORDER_PAYMENT_STATUS } from "~/lib/domain";

export type FeedEvent = {
  product: string;
  detail: string;
  size: string;
  price?: string;
  actor?: string;
  qty?: number;
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

  const [salesAgg, totalOrders, allOrders, consignFeesAgg, storeAgg, inventoryAgg, activeListingCount, activeProductCount, submittedCount, awaitingDropoffCount, withdrawalRequestCount, pendingPickupCount] = await Promise.all([
    prisma.transaction.aggregate({ where: { type: TRANSACTION_TYPE.SALE, orderItem: { status: "sold" } }, _sum: { grossAmount: true } }),
    prisma.order.count({ where: { paymentStatus: { in: [ORDER_PAYMENT_STATUS.PAID, "refunded"] } } }),
    prisma.order.count(),
    prisma.transaction.aggregate({ where: { type: TRANSACTION_TYPE.SALE, orderItem: { status: "sold" }, consignor: { storeOwned: false } }, _sum: { feeAmount: true } }),
    prisma.transaction.aggregate({ where: { type: TRANSACTION_TYPE.SALE, orderItem: { status: "sold" }, consignor: { storeOwned: true } }, _sum: { grossAmount: true, cost: true } }),
    prisma.listing.aggregate({ where: { status: LISTING_STATUS.ACTIVE }, _sum: { price: true } }),
    prisma.listing.count({ where: { status: LISTING_STATUS.ACTIVE } }),
    prisma.product.count({ where: { variants: { some: { listings: { some: { status: LISTING_STATUS.ACTIVE } } } } } }),
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

  const activityFeed = await getActivityFeed(15);

  return {
    totalSales,
    totalOrders,
    allOrders,
    consignmentFees,
    storeProfit,
    totalEarnings,
    inventoryValue,
    activeListingCount,
    activeProductCount,
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
  const listingInclude = { consignor: true, variant: { include: { product: true } } } as const;
  const [recentlyCreated, recentlySold, refundTxs] = await Promise.all([
    prisma.listing.findMany({
      take,
      orderBy: { createdAt: "desc" },
      include: listingInclude,
    }),
    // Separate query for sales — sold items may have been created long ago
    prisma.listing.findMany({
      take,
      where: { soldAt: { not: null } },
      orderBy: { soldAt: "desc" },
      include: listingInclude,
    }),
    prisma.transaction.findMany({
      where: { type: TRANSACTION_TYPE.REFUND },
      take: Math.max(Math.floor(take / 3), 10),
      orderBy: { createdAt: "desc" },
      include: {
        orderItem: {
          include: {
            listing: { include: listingInclude },
          },
        },
      },
    }),
  ]);

  // Deduplicate: a listing can appear in both queries
  const seen = new Set<string>();
  const recentListings = [...recentlySold, ...recentlyCreated].filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });

  const now = new Date();
  type SortableFeedEvent = FeedEvent & { sortTime: number; _groupKey?: string };
  const events: SortableFeedEvent[] = [];

  for (const listing of recentListings) {
    const product = listing.variant.product.title;
    const size = listing.variant.size;

    if (listing.status === LISTING_STATUS.SOLD && listing.soldAt && listing.price != null) {
      events.push({
        product, size, detail: "sold for", price: `$${fmt(listing.price)}`,
        time: relativeTime(now, listing.soldAt), type: "sale",
        sortTime: listing.soldAt.getTime(),
      });
    }

    if (listing.status === LISTING_STATUS.PENDING_SALE && listing.soldAt) {
      events.push({
        product, size, detail: "ordered, awaiting payment",
        time: relativeTime(now, listing.soldAt), type: "request",
        sortTime: listing.soldAt.getTime(),
      });
    }

    // Group listings created at the same time (batch creation with qty > 1)
    const listingKey = `${listing.consignor.id}:${product}:${size}:${listing.createdAt.getTime()}`;
    const existing = events.find((e) => e.type === "listing" && e._groupKey === listingKey);
    if (existing) {
      existing.qty = (existing.qty ?? 1) + 1;
    } else {
      events.push({
        product, size,
        detail: listing.price != null ? "listed at" : "created (needs price)",
        price: listing.price != null ? `$${fmt(listing.price)}` : "—",
        actor: listing.consignor.name,
        time: relativeTime(now, listing.createdAt), type: "listing",
        sortTime: listing.createdAt.getTime(),
        _groupKey: listingKey, qty: 1,
      });
    }
  }

  for (const tx of refundTxs) {
    if (!tx.orderItem) continue;
    const listing = tx.orderItem.listing;
    const product = listing.variant.product.title;
    const size = listing.variant.size;
    events.push({
      product, size, detail: "refunded", price: `$${fmt(Math.abs(tx.grossAmount))}`,
      time: relativeTime(now, tx.createdAt), type: "request",
      sortTime: tx.createdAt.getTime(),
    });
  }

  events.sort((a, b) => b.sortTime - a.sortTime);
  const strip = ({ sortTime, _groupKey, ...rest }: SortableFeedEvent): FeedEvent => rest;
  if (limit === 0) return events.map(strip);
  return events.slice(0, limit).map(strip);
}
