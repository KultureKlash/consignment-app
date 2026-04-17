import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { ensureShopifyProductAndVariant } from "~/services/shopify/products.server";
import { safeSyncInventory } from "~/services/inventory.server";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { ensureVariantBarcode } from "~/services/catalog.server";
import { logger } from "~/lib/logger.server";
import { sendWithdrawalApprovedEmail, sendListingLiveEmail } from "~/services/email.server";

// ── Admin: Check-in listing (consignor dropoff) → goes live on Shopify ──

export async function checkinListing({
  admin,
  listingId,
}: {
  admin: AdminApiContext;
  listingId: string;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: { include: { product: true } } },
  });

  if (listing.status !== LISTING_STATUS.APPROVED) {
    throw new Error(`Cannot check in listing with status "${listing.status}"`);
  }

  const { variant } = listing;
  const { product } = variant;

  // Auto-generate barcode for non-footwear if not present
  if (!variant.gtin) {
    await ensureVariantBarcode(variant.id, { brand: product.brand, category: product.category, size: variant.size });
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: LISTING_STATUS.ACTIVE, listedAt: new Date() },
    include: { consignor: true, variant: { include: { product: true } } },
  });

  // Shopify sync (best-effort)
  try {
    const freshVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });
    const freshProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    const imageData = freshProduct.imageUrl?.startsWith("data:") ? freshProduct.imageUrl : undefined;

    await ensureShopifyProductAndVariant({ admin, product: freshProduct, variant: freshVariant, imageData });

    const syncedVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });
    await safeSyncInventory({ admin, variant: syncedVariant, context: "activation" });
  } catch (err) {
    logger.error("Shopify sync failed during activation", { error: err instanceof Error ? err.message : String(err) });
  }

  sendListingLiveEmail(updated.consignor, [{
    product: updated.variant.product.title,
    size: updated.variant.size,
  }]).catch(() => {});

  return updated;
}

// ── Admin: Approve a withdrawal request → pending pickup ──

export async function approveWithdrawal({
  admin,
  listingId,
}: {
  admin: AdminApiContext;
  listingId: string;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: true },
  });

  if (listing.status !== LISTING_STATUS.WITHDRAWAL_REQUESTED) {
    throw new Error(`Cannot approve withdrawal for listing with status "${listing.status}"`);
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: LISTING_STATUS.PENDING_PICKUP, withdrawalApprovedAt: new Date() },
    include: { consignor: true, variant: { include: { product: true } } },
  });

  // listing.variant already loaded via include above
  await safeSyncInventory({ admin, variant: listing.variant, context: "withdrawal approval" });

  sendWithdrawalApprovedEmail(updated.consignor, {
    product: updated.variant.product.title,
    size: updated.variant.size,
  }).catch(() => {});

  return updated;
}

// ── Admin: Deny a withdrawal request → back to active ──

export async function denyWithdrawal({
  admin,
  listingId,
}: {
  admin: AdminApiContext;
  listingId: string;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: true },
  });

  if (listing.status !== LISTING_STATUS.WITHDRAWAL_REQUESTED) {
    throw new Error(`Cannot deny withdrawal for listing with status "${listing.status}"`);
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: LISTING_STATUS.ACTIVE },
    include: { consignor: true, variant: { include: { product: true } } },
  });

  await safeSyncInventory({ admin, variant: listing.variant, context: "withdrawal denied" });

  return updated;
}

// ── Admin: Complete withdrawal (consignor picked up item) ──

export async function completeWithdrawal({
  listingId,
}: {
  listingId: string;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });

  if (listing.status !== LISTING_STATUS.PENDING_PICKUP) {
    throw new Error(`Cannot complete withdrawal for listing with status "${listing.status}"`);
  }

  return prisma.listing.update({
    where: { id: listingId },
    data: { status: LISTING_STATUS.WITHDRAWN },
    include: { consignor: true, variant: { include: { product: true } } },
  });
}
