import prisma from "~/db.server";
import { findOrCreateProduct, findOrCreateVariant, detectDuplicateProduct, DuplicateError } from "~/services/catalog";
import { syncInventory } from "~/services/inventory";
import { ensureShopifyProductAndVariant } from "~/services/shopify/products.server";
import { LISTING_STATUS } from "~/lib/domain";
import { CONSIGNOR_STATUS } from "~/lib/domain";
import { logger } from "~/lib/system";
import { sendSubmissionConfirmedEmail } from "~/services/email";

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
  useExistingProductId,
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
  /** When set, skip dedup detection and attach this submission to the named product.
   *  Used after the consignor explicitly confirms an existing product in the dedup modal. */
  useExistingProductId?: string;
}) {
  await requireActiveConsignor(consignorId);

  let product;
  if (useExistingProductId) {
    product = await prisma.product.findUniqueOrThrow({ where: { id: useExistingProductId } });
  } else {
    const dup = await detectDuplicateProduct({ title, brand, sku, gtin });
    if (dup.kind !== "none") throw new DuplicateError(dup);
    product = await findOrCreateProduct({ sku, title, brand, category });
  }
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
  // submitListing always provides a price (consignor-submitted), so first.price is non-null here
  sendSubmissionConfirmedEmail(first.consignor, {
    product: first.variant.product.title,
    size: first.variant.size,
    price: first.price ?? 0,
    quantity: listings.length,
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
  if (listing.status !== LISTING_STATUS.SUBMITTED && listing.status !== LISTING_STATUS.AWAITING_PRICE) {
    throw new Error("Can only delete submitted or unpriced listings");
  }

  await prisma.listing.delete({ where: { id: listingId } });
}

// ── Portal: Consignor sets price on an admin-created unpriced listing ──

export async function setUnpricedListingPrice({
  listingId,
  consignorId,
  price,
}: {
  listingId: string;
  consignorId: string;
  price: number;
}) {
  await requireActiveConsignor(consignorId);
  if (price <= 0 || price > 999999.99) throw new Error("Invalid price");

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: { include: { product: true } } },
  });

  if (listing.consignorId !== consignorId) {
    throw new Error("Not authorized");
  }
  if (listing.status !== LISTING_STATUS.AWAITING_PRICE) {
    throw new Error("Listing already has a price");
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { price, status: LISTING_STATUS.ACTIVE, listedAt: new Date() },
    include: { variant: { include: { product: true } } },
  });

  // First-time Shopify sync — variant doesn't exist on Shopify yet
  try {
    const session = await prisma.session.findFirst({
      where: { isOnline: false, accessToken: { not: "" } },
      select: { shop: true },
    });
    if (session) {
      const { unauthenticated } = await import("~/shopify.server");
      const { admin } = await unauthenticated.admin(session.shop);
      const product = await prisma.product.findUniqueOrThrow({ where: { id: listing.variant.productId } });
      const variant = await prisma.variant.findUniqueOrThrow({ where: { id: listing.variantId } });
      await ensureShopifyProductAndVariant({ admin, product, variant, imageData: product.imageUrl?.startsWith("data:") ? product.imageUrl : undefined });
      const syncedVariant = await prisma.variant.findUniqueOrThrow({ where: { id: listing.variantId } });
      await syncInventory({ admin, variant: syncedVariant });
    }
  } catch (err) {
    logger.error("Shopify sync failed after initial price set (will retry on next operation)", { error: err instanceof Error ? err.message : String(err) });
  }

  return updated;
}

// ── Portal: Bulk-set price on multiple admin-created unpriced listings ──

export async function bulkSetUnpricedListingPrices({
  listingIds,
  consignorId,
  price,
}: {
  listingIds: string[];
  consignorId: string;
  price: number;
}): Promise<{ updated: number; syncErrors: string[] }> {
  await requireActiveConsignor(consignorId);
  if (price <= 0 || price > 999999.99) throw new Error("Invalid price");
  if (listingIds.length === 0) throw new Error("No listings selected");

  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds } },
    include: { variant: { include: { product: true } } },
  });

  if (listings.length !== listingIds.length) {
    throw new Error("One or more listings not found");
  }
  for (const l of listings) {
    if (l.consignorId !== consignorId) throw new Error("Not authorized");
    if (l.status !== LISTING_STATUS.AWAITING_PRICE) {
      throw new Error("All selected listings must be awaiting price");
    }
  }

  const now = new Date();
  await prisma.listing.updateMany({
    where: { id: { in: listingIds } },
    data: { price, status: LISTING_STATUS.ACTIVE, listedAt: now },
  });

  // Sync ONCE per unique variant — not per listing
  const variantMap = new Map<string, typeof listings[0]["variant"]>();
  for (const l of listings) {
    if (!variantMap.has(l.variantId)) variantMap.set(l.variantId, l.variant);
  }

  const syncErrors: string[] = [];
  try {
    const session = await prisma.session.findFirst({
      where: { isOnline: false, accessToken: { not: "" } },
      select: { shop: true },
    });
    if (session) {
      const { unauthenticated } = await import("~/shopify.server");
      const { admin } = await unauthenticated.admin(session.shop);

      for (const [variantId, variant] of variantMap) {
        try {
          const product = await prisma.product.findUniqueOrThrow({ where: { id: variant.productId } });
          await ensureShopifyProductAndVariant({ admin, product, variant, imageData: product.imageUrl?.startsWith("data:") ? product.imageUrl : undefined });
          const syncedVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variantId } });
          await syncInventory({ admin, variant: syncedVariant });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          syncErrors.push(`Variant ${variantId}: ${msg}`);
          logger.error("Shopify sync failed during bulk price set", { variantId, error: msg });
        }
      }
    }
  } catch (err) {
    logger.error("Bulk price sync setup failed", { error: err instanceof Error ? err.message : String(err) });
  }

  return { updated: listings.length, syncErrors };
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

// ── Portal: Consignor bulk-updates price on N active listings ──

export async function bulkUpdateActiveListingPrice({
  consignorId,
  listingIds,
  price,
}: {
  consignorId: string;
  listingIds: string[];
  price: number;
}): Promise<{ updated: number; skipped: number }> {
  await requireActiveConsignor(consignorId);
  if (price <= 0 || price > 999999.99) throw new Error("Invalid price");

  // IDOR guard + status filter: only ACTIVE listings owned by this consignor
  const eligible = await prisma.listing.findMany({
    where: {
      id: { in: listingIds },
      consignorId,
      status: { in: [LISTING_STATUS.ACTIVE, LISTING_STATUS.APPROVED] },
    },
    include: { variant: true },
  });

  if (eligible.length === 0) {
    return { updated: 0, skipped: listingIds.length };
  }

  const eligibleIds = eligible.map((l) => l.id);
  await prisma.listing.updateMany({
    where: { id: { in: eligibleIds } },
    data: { price },
  });

  // Shopify reflects the lowest active price per variant — sync once per unique variant.
  try {
    const session = await prisma.session.findFirst({
      where: { isOnline: false, accessToken: { not: "" } },
      select: { shop: true },
    });
    if (session) {
      const { unauthenticated } = await import("~/shopify.server");
      const { admin } = await unauthenticated.admin(session.shop);
      const seen = new Set<string>();
      for (const l of eligible) {
        if (seen.has(l.variantId)) continue;
        seen.add(l.variantId);
        const variant = await prisma.variant.findUniqueOrThrow({ where: { id: l.variantId } });
        await syncInventory({ admin, variant });
      }
    }
  } catch (err) {
    logger.error("Shopify price sync failed during bulk update (will retry on next operation)", { error: err instanceof Error ? err.message : String(err) });
  }

  return { updated: eligible.length, skipped: listingIds.length - eligible.length };
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
