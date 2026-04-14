import prisma from "~/db.server";
import { fmt } from "~/lib/currency";
import { LISTING_STATUS } from "~/lib/listing-statuses";

export interface PortalNotification {
  id: string;
  type: string;
  title: string;
  description: string;
  time: Date;
  color: string;
}

export function buildNotifications(
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
      description: `${sale.product} sold for $${fmt(sale.consignorAmount)}`,
      time: sale.createdAt,
      color: "text-[hsl(var(--success))]",
    });
  }

  for (const payout of payouts) {
    notifications.push({
      id: `payout-${payout.id}`,
      type: "payout",
      title: payout.status === "paid" ? "Payout Received" : "Payout Pending",
      description: `$${fmt(payout.amount)} ${payout.status === "paid" ? "paid out" : "pending"}`,
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

/** Check if in-app notifications are enabled from prefs JSON */
function isInAppEnabled(prefsJson: string | null | undefined): boolean {
  if (!prefsJson) return true; // null = all enabled
  try {
    const parsed = JSON.parse(prefsJson);
    // New format: { inApp: boolean, email: boolean }
    if (typeof parsed.inApp === "boolean") return parsed.inApp;
    // Legacy format: { disabled: string[] } — treat as enabled
    return true;
  } catch {
    return true;
  }
}

export async function getConsignorNotifications(
  consignorId: string,
  notificationsReadAt: Date | null,
  notificationPrefs?: string | null,
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
      where: { consignorId, status: LISTING_STATUS.REJECTED, rejectedAt: { not: null } },
      orderBy: { rejectedAt: "desc" },
      take: 10,
      include: { variant: { include: { product: true } } },
    }),
    prisma.listing.findMany({
      where: { consignorId, status: LISTING_STATUS.APPROVED, approvedAt: { not: null } },
      orderBy: { approvedAt: "desc" },
      take: 10,
      include: { variant: { include: { product: true } } },
    }),
    // All withdrawal-related listings (covers all 3 statuses)
    prisma.listing.findMany({
      where: { consignorId, status: { in: [LISTING_STATUS.WITHDRAWAL_REQUESTED, LISTING_STATUS.PENDING_PICKUP, LISTING_STATUS.WITHDRAWN] }, withdrawnAt: { not: null } },
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
    if (l.status === LISTING_STATUS.PENDING_PICKUP || l.status === LISTING_STATUS.WITHDRAWN) {
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
    if (l.status === LISTING_STATUS.WITHDRAWN) {
      withdrawalNotifs.push({
        id: l.id,
        time: new Date((l.withdrawnAt as Date).getTime() + 2000),
        product: l.variant.product.title,
        size: l.variant.size,
        type: "withdrawn",
      });
    }
  }

  const allItems = buildNotifications(saleNotifs, recentPayouts, rejectionNotifs, approvalNotifs, withdrawalNotifs);
  const inAppEnabled = isInAppEnabled(notificationPrefs);
  const items = inAppEnabled ? allItems : [];
  const unreadCount = notificationsReadAt
    ? items.filter((item) => new Date(item.time) > notificationsReadAt).length
    : items.length;
  return { items, unreadCount };
}
