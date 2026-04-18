import prisma from "~/db.server";
import { findOrCreateProduct, findOrCreateVariant } from "~/services/catalog.server";
import { syncInventory } from "~/services/inventory.server";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { CONSIGNOR_STATUS } from "~/lib/order-statuses";
import { logger } from "~/lib/logger.server";
import { sendSubmissionConfirmedEmail } from "~/services/email.server";

/** Throws if the consignor account is suspended. Used by all portal-facing functions. */
async function requireActiveConsignor(consignorId: string) {
  const consignor = await prisma.consignor.findUniqueOrThrow({ where: { id: consignorId } });
  if (consignor.status === CONSIGNOR_STATUS.SUSPENDED) {
    throw new Error("Your account has been suspended. You cannot perform this action.");
  }
  return consignor;
}

// ── Portal: Consignor submits listing(s) for review ──

export async function submitListing({
  consignorId,
  sku,
  title,
  brand,
  category,
  size,
  gtin,
  price,
  count = 1,
  imageData,
}: {
  consignorId: string;
  sku?: string | null;
  title: string;
  brand?: string;
  category?: string;
  size: string;
  gtin?: string;
  price: number;
  count?: number;
  imageData?: string;
}) {
  await requireActiveConsignor(consignorId);

  const product = await findOrCreateProduct({ sku, title, brand, category });
  const variant = await findOrCreateVariant({ productId: product.id, size, gtin });

  // Store image on product if provided and product has no image yet
  if (imageData && !product.imageUrl) {
    await prisma.product.update({
      where: { id: product.id },
      data: { imageUrl: imageData }, // stored as base64 data URL, uploaded to Shopify at activation
    });
  }

  // Per-item model: each listing = 1 physical item, so create `count` rows
  const now = new Date();
  const listings = [];
  for (let i = 0; i < count; i++) {
    const listing = await prisma.listing.create({
      data: {
        consignorId,
        variantId: variant.id,
        price,
        status: LISTING_STATUS.SUBMITTED,
        submittedAt: now,
      },
      include: {
        consignor: true,
        variant: { include: { product: true } },
      },
    });
    listings.push(listing);
  }

  const first = listings[0];
  sendSubmissionConfirmedEmail(first.consignor, {
    product: first.variant.product.title,
    size: first.variant.size,
    price: first.price,
  }).catch(() => {});

  return first;
}

// ── Portal: Consignor edits a submitted listing ──

export async function updateSubmittedListing({
  listingId,
  consignorId,
  price,
  size,
  gtin,
}: {
  listingId: string;
  consignorId: string;
  price?: number;
  size?: string;
  gtin?: string;
}) {
  await requireActiveConsignor(consignorId);

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: { include: { product: true } } },
  });

  if (listing.consignorId !== consignorId) {
    throw new Error("Not authorized");
  }
  if (listing.status !== LISTING_STATUS.SUBMITTED) {
    throw new Error("Can only edit submitted listings");
  }

  // If size changed, find or create the new variant
  let variantId = listing.variantId;
  if (size && size !== listing.variant.size) {
    const newVariant = await findOrCreateVariant({
      productId: listing.variant.productId,
      size,
      gtin,
    });
    variantId = newVariant.id;
  } else if (gtin && gtin !== listing.variant.gtin) {
    // Just backfill GTIN on existing variant
    await findOrCreateVariant({
      productId: listing.variant.productId,
      size: listing.variant.size,
      gtin,
    });
  }

  return prisma.listing.update({
    where: { id: listingId },
    data: {
      ...(price !== undefined ? { price } : {}),
      ...(variantId !== listing.variantId ? { variantId } : {}),
    },
    include: {
      consignor: true,
      variant: { include: { product: true } },
    },
  });
}

// ── Portal: Consignor deletes a submitted listing ──

export async function deleteSubmittedListing({
  listingId,
  consignorId,
}: {
  listingId: string;
  consignorId: string;
}) {
  await requireActiveConsignor(consignorId);

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
  });

  if (listing.consignorId !== consignorId) {
    throw new Error("Not authorized");
  }
  if (listing.status !== LISTING_STATUS.SUBMITTED) {
    throw new Error("Can only delete submitted listings");
  }

  await prisma.listing.delete({ where: { id: listingId } });
}

// ── Portal: Consignor updates price on an active listing ──

export async function updateActiveListingPrice({
  listingId,
  consignorId,
  price,
}: {
  listingId: string;
  consignorId: string;
  price: number;
}) {
  await requireActiveConsignor(consignorId);
  if (price <= 0) throw new Error("Price must be greater than zero");

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: true },
  });

  if (listing.consignorId !== consignorId) {
    throw new Error("Not authorized");
  }
  if (listing.status !== LISTING_STATUS.ACTIVE && listing.status !== LISTING_STATUS.APPROVED) {
    throw new Error("Can only update price on active or awaiting drop-off listings");
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { price },
    include: { variant: { include: { product: true } } },
  });

  // Sync to Shopify (best-effort) — get admin via offline session
  try {
    const session = await prisma.session.findFirst({
      where: { isOnline: false, accessToken: { not: "" } },
      select: { shop: true },
    });
    if (session) {
      const { unauthenticated } = await import("~/shopify.server");
      const { admin } = await unauthenticated.admin(session.shop);
      const variant = await prisma.variant.findUniqueOrThrow({
        where: { id: listing.variantId },
      });
      await syncInventory({ admin, variant });
    }
  } catch (err) {
    logger.error("Shopify price sync failed (will retry on next operation)", { error: err instanceof Error ? err.message : String(err) });
  }

  return updated;
}

// ── Portal: Consignor requests withdrawal of an active listing ──

export async function requestWithdrawal({
  listingId,
  consignorId,
}: {
  listingId: string;
  consignorId: string;
}) {
  await requireActiveConsignor(consignorId);

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: true },
  });

  if (listing.consignorId !== consignorId) {
    throw new Error("Not authorized");
  }
  if (listing.status !== LISTING_STATUS.ACTIVE) {
    throw new Error("Can only request withdrawal on active listings");
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: LISTING_STATUS.WITHDRAWAL_REQUESTED, withdrawnAt: new Date() },
    include: { variant: { include: { product: true } } },
  });

  // Sync Shopify — item is no longer active so inventory drops to 0
  try {
    const session = await prisma.session.findFirst({
      where: { isOnline: false, accessToken: { not: "" } },
      select: { shop: true },
    });
    if (session) {
      const { unauthenticated } = await import("~/shopify.server");
      const { admin } = await unauthenticated.admin(session.shop);
      const variant = await prisma.variant.findUniqueOrThrow({
        where: { id: listing.variantId },
      });
      await syncInventory({ admin, variant });
    }
  } catch (err) {
    logger.error("Shopify sync failed during withdrawal request", { error: err instanceof Error ? err.message : String(err) });
  }

  return updated;
}
