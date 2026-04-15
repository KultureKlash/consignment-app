import prisma from "~/db.server";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { sendListingRejectedEmail } from "~/services/email.server";

// ── Admin: Approve a submitted listing ──

export async function approveListing({ listingId }: { listingId: string }) {
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });

  if (listing.status !== LISTING_STATUS.SUBMITTED) {
    throw new Error(`Cannot approve listing with status "${listing.status}"`);
  }

  return prisma.listing.update({
    where: { id: listingId },
    data: {
      status: LISTING_STATUS.APPROVED,
      approvedAt: new Date(),
    },
    include: { consignor: true, variant: { include: { product: true } } },
  });
}

// ── Admin: Reject a submitted listing ──

export async function rejectListing({
  listingId,
  reason,
}: {
  listingId: string;
  reason: string;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });

  if (listing.status !== LISTING_STATUS.SUBMITTED) {
    throw new Error(`Cannot reject listing with status "${listing.status}"`);
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      status: LISTING_STATUS.REJECTED,
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
    include: { consignor: true, variant: { include: { product: true } } },
  });

  sendListingRejectedEmail(updated.consignor, {
    product: updated.variant.product.title,
    size: updated.variant.size,
    reason,
  }).catch(() => {});

  return updated;
}

// ── Admin: Edit listing fields and approve in one step ──

export async function adminEditAndApprove({
  listingId,
  size,
  gtin,
  price,
}: {
  listingId: string;
  size?: string;
  gtin?: string;
  price?: number;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: { include: { product: true } } },
  });

  if (listing.status !== LISTING_STATUS.SUBMITTED) {
    throw new Error(`Cannot edit and approve listing with status "${listing.status}"`);
  }

  // Update variant in-place (product edits are separate)
  const variantUpdate: Record<string, unknown> = {};
  if (size && size !== listing.variant.size) variantUpdate.size = size;
  if (gtin !== undefined && gtin !== (listing.variant.gtin ?? "")) {
    if (gtin) {
      const existing = await prisma.variant.findFirst({ where: { gtin, id: { not: listing.variantId } } });
      if (existing) throw new Error(`Barcode "${gtin}" is already assigned to another variant`);
    }
    variantUpdate.gtin = gtin || null;
  }

  if (Object.keys(variantUpdate).length > 0) {
    await prisma.variant.update({ where: { id: listing.variantId }, data: variantUpdate });
  }

  return prisma.listing.update({
    where: { id: listingId },
    data: {
      ...(price !== undefined ? { price } : {}),
      status: LISTING_STATUS.APPROVED,
      approvedAt: new Date(),
    },
    include: { consignor: true, variant: { include: { product: true } } },
  });
}
