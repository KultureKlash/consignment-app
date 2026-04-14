import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { activateListing } from "./lifecycle.server";

// ── Admin: Bulk approve ──

export async function bulkApproveListing({ listingIds }: { listingIds: string[] }) {
  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds }, status: "submitted" },
  });

  if (listings.length === 0) return { approved: 0 };

  const now = new Date();
  await prisma.listing.updateMany({
    where: { id: { in: listings.map((l) => l.id) } },
    data: { status: "approved_awaiting_dropoff", approvedAt: now },
  });

  return { approved: listings.length };
}

// ── Admin: Bulk activate ──

export async function bulkActivateListing({
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
      await activateListing({ admin, listingId: id });
      activated++;
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { activated, errors };
}
