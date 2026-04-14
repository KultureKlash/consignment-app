import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { checkinListing } from "./lifecycle.server";
import { LISTING_STATUS } from "~/lib/listing-statuses";

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
  let activated = 0;

  for (const id of listingIds) {
    try {
      await checkinListing({ admin, listingId: id });
      activated++;
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { activated, errors };
}
