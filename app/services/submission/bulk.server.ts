import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { checkinListing } from "./lifecycle.server";
import { LISTING_STATUS, CONSIGNOR_STATUS } from "~/lib/domain";
import { safeSyncInventory } from "~/services/inventory";
import { logger } from "~/lib/system";
import {
  sendListingApprovedEmail,
  sendListingLiveEmail,
  sendWithdrawalApprovedEmail,
  sendWithdrawalDeniedEmail,
} from "~/services/email";

// ── Admin: Bulk approve ──

export async function bulkApproveListing({ listingIds }: { listingIds: string[] }) {
  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds }, status: LISTING_STATUS.SUBMITTED },
    select: { id: true },
  });

  if (listings.length === 0) return { approved: 0 };

  await prisma.listing.updateMany({
    where: { id: { in: listings.map((l) => l.id) } },
    data: { status: LISTING_STATUS.APPROVED, approvedAt: new Date() },
  });

  // Group by consignor → one email per consignor with all their approved items
  const approved = await prisma.listing.findMany({
    where: { id: { in: listings.map((l) => l.id) } },
    include: { consignor: true, variant: { include: { product: true } } },
  });

  const byConsignor = new Map<string, { consignor: typeof approved[0]["consignor"]; items: Array<{ product: string; size: string }> }>();
  for (const l of approved) {
    const existing = byConsignor.get(l.consignorId);
    const item = { product: l.variant.product.title, size: l.variant.size };
    if (existing) {
      existing.items.push(item);
    } else {
      byConsignor.set(l.consignorId, { consignor: l.consignor, items: [item] });
    }
  }

  for (const { consignor, items } of byConsignor.values()) {
    sendListingApprovedEmail(consignor, items).catch(() => {});
  }

  return { approved: listings.length };
}

// ── Admin: Bulk check-in ──

export async function bulkCheckinListing({
  admin,
  listingIds,
}: {
  admin: AdminApiContext;
  listingIds: string[];
}) {
  const errors: string[] = [];
  const checkedIn: Array<{ consignorId: string; consignor: { email: string; notificationPrefs?: string | null }; product: string; size: string }> = [];

  for (const id of listingIds) {
    try {
      const result = await checkinListing({ admin, listingId: id });
      checkedIn.push({
        consignorId: result.consignorId,
        consignor: result.consignor,
        product: result.variant.product.title,
        size: result.variant.size,
      });
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Group by consignor → one "your items are live" email per consignor
  const byConsignor = new Map<string, { consignor: typeof checkedIn[0]["consignor"]; items: Array<{ product: string; size: string }> }>();
  for (const c of checkedIn) {
    const existing = byConsignor.get(c.consignorId);
    const item = { product: c.product, size: c.size };
    if (existing) {
      existing.items.push(item);
    } else {
      byConsignor.set(c.consignorId, { consignor: c.consignor, items: [item] });
    }
  }

  for (const { consignor, items } of byConsignor.values()) {
    sendListingLiveEmail(consignor, items).catch(() => {});
  }

  return { activated: checkedIn.length, errors };
}

// ── Internal helpers (shared by withdrawal bulks) ──

type SyncableVariant = { id: string };

/**
 * After a status change, sync inventory once per *unique* variant (not per listing).
 * Listings of the same variant can have different prices but the Shopify variant
 * inventory reflects the count of ACTIVE listings — one sync covers the whole variant.
 */
async function syncVariantsOnce(
  admin: AdminApiContext,
  variants: SyncableVariant[],
  context: string,
): Promise<void> {
  const seen = new Set<string>();
  for (const variant of variants) {
    if (seen.has(variant.id)) continue;
    seen.add(variant.id);
    await safeSyncInventory({ admin, variant, context });
  }
}

type ConsignorBucket = {
  consignor: { email: string; notificationPrefs?: string | null };
  items: Array<{ product: string; size: string }>;
};

function groupByConsignor(
  listings: Array<{
    consignorId: string;
    consignor: { email: string; notificationPrefs?: string | null };
    variant: { size: string; product: { title: string } };
  }>,
): Map<string, ConsignorBucket> {
  const byConsignor = new Map<string, ConsignorBucket>();
  for (const l of listings) {
    const item = { product: l.variant.product.title, size: l.variant.size };
    const existing = byConsignor.get(l.consignorId);
    if (existing) {
      existing.items.push(item);
    } else {
      byConsignor.set(l.consignorId, { consignor: l.consignor, items: [item] });
    }
  }
  return byConsignor;
}

// ── Portal: Consignor requests withdrawal of N active listings (batch) ──

export async function bulkRequestWithdrawal({
  consignorId,
  listingIds,
}: {
  consignorId: string;
  listingIds: string[];
}): Promise<{ requested: number; skipped: number }> {
  const consignor = await prisma.consignor.findUniqueOrThrow({ where: { id: consignorId } });
  if (consignor.status === CONSIGNOR_STATUS.SUSPENDED) {
    throw new Error("Your account has been suspended. You cannot perform this action.");
  }

  // IDOR guard: scope to this consignor's own ACTIVE listings only
  const eligible = await prisma.listing.findMany({
    where: {
      id: { in: listingIds },
      consignorId,
      status: LISTING_STATUS.ACTIVE,
    },
    include: { variant: true },
  });

  if (eligible.length === 0) {
    return { requested: 0, skipped: listingIds.length };
  }

  const eligibleIds = eligible.map((l) => l.id);
  await prisma.listing.updateMany({
    where: { id: { in: eligibleIds } },
    data: { status: LISTING_STATUS.WITHDRAWAL_REQUESTED, withdrawnAt: new Date() },
  });

  // Shopify sync — resolve admin from a stored session (same pattern as single requestWithdrawal)
  try {
    const session = await prisma.session.findFirst({
      where: { isOnline: false, accessToken: { not: "" } },
      select: { shop: true },
    });
    if (session) {
      const { unauthenticated } = await import("~/shopify.server");
      const { admin } = await unauthenticated.admin(session.shop);
      await syncVariantsOnce(admin, eligible.map((l) => l.variant), "withdrawal requested");
    }
  } catch (err) {
    logger.error("Shopify sync failed during bulk withdrawal request", { error: err instanceof Error ? err.message : String(err) });
  }

  return { requested: eligible.length, skipped: listingIds.length - eligible.length };
}

// ── Admin: Bulk approve withdrawal requests → pending pickup ──

export async function bulkApproveWithdrawal({
  admin,
  listingIds,
}: {
  admin: AdminApiContext;
  listingIds: string[];
}): Promise<{ approved: number; skipped: number }> {
  const eligible = await prisma.listing.findMany({
    where: { id: { in: listingIds }, status: LISTING_STATUS.WITHDRAWAL_REQUESTED },
    select: { id: true },
  });

  if (eligible.length === 0) {
    return { approved: 0, skipped: listingIds.length };
  }

  const eligibleIds = eligible.map((l) => l.id);
  await prisma.listing.updateMany({
    where: { id: { in: eligibleIds } },
    data: { status: LISTING_STATUS.PENDING_PICKUP, withdrawalApprovedAt: new Date() },
  });

  const approved = await prisma.listing.findMany({
    where: { id: { in: eligibleIds } },
    include: { consignor: true, variant: { include: { product: true } } },
  });

  await syncVariantsOnce(admin, approved.map((l) => l.variant), "withdrawal approval");

  const byConsignor = groupByConsignor(approved);
  for (const { consignor, items } of byConsignor.values()) {
    sendWithdrawalApprovedEmail(consignor, items).catch(() => {});
  }

  return { approved: approved.length, skipped: listingIds.length - approved.length };
}

// ── Admin: Bulk deny withdrawal requests → back to active ──

export async function bulkDenyWithdrawal({
  admin,
  listingIds,
}: {
  admin: AdminApiContext;
  listingIds: string[];
}): Promise<{ denied: number; skipped: number }> {
  const eligible = await prisma.listing.findMany({
    where: { id: { in: listingIds }, status: LISTING_STATUS.WITHDRAWAL_REQUESTED },
    select: { id: true },
  });

  if (eligible.length === 0) {
    return { denied: 0, skipped: listingIds.length };
  }

  const eligibleIds = eligible.map((l) => l.id);
  await prisma.listing.updateMany({
    where: { id: { in: eligibleIds } },
    data: { status: LISTING_STATUS.ACTIVE },
  });

  const denied = await prisma.listing.findMany({
    where: { id: { in: eligibleIds } },
    include: { consignor: true, variant: { include: { product: true } } },
  });

  await syncVariantsOnce(admin, denied.map((l) => l.variant), "withdrawal denied");

  const byConsignor = groupByConsignor(denied);
  for (const { consignor, items } of byConsignor.values()) {
    sendWithdrawalDeniedEmail(consignor, items).catch(() => {});
  }

  return { denied: denied.length, skipped: listingIds.length - denied.length };
}

// ── Admin: Bulk mark withdrawals as picked up → withdrawn ──

export async function bulkCompleteWithdrawal({
  admin,
  listingIds,
}: {
  admin: AdminApiContext;
  listingIds: string[];
}): Promise<{ completed: number; skipped: number }> {
  const eligible = await prisma.listing.findMany({
    where: { id: { in: listingIds }, status: LISTING_STATUS.PENDING_PICKUP },
    include: { variant: true },
  });

  if (eligible.length === 0) {
    return { completed: 0, skipped: listingIds.length };
  }

  const eligibleIds = eligible.map((l) => l.id);
  await prisma.listing.updateMany({
    where: { id: { in: eligibleIds } },
    data: { status: LISTING_STATUS.WITHDRAWN },
  });

  await syncVariantsOnce(admin, eligible.map((l) => l.variant), "withdrawal completed");

  return { completed: eligible.length, skipped: listingIds.length - eligible.length };
}
