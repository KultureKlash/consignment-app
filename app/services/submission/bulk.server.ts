import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { checkinListing } from "./lifecycle.server";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { sendListingApprovedEmail, sendListingLiveEmail } from "~/services/email.server";

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
