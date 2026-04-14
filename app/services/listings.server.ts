import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { findOrCreateProduct, findOrCreateVariant } from "~/services/catalog.server";
import { ensureShopifyProductAndVariant } from "~/services/shopify/products.server";
import { syncInventory } from "~/services/inventory.server";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { ensureVariantBarcode } from "~/services/catalog.server";
import { logger } from "~/lib/logger.server";

export async function createListing({
  admin,
  sku,
  title,
  brand,
  category,
  size,
  gtin,
  price,
  count = 1,
  consignorId,
  taxonomyId,
  imageData,
  cost,
}: {
  admin: AdminApiContext;
  sku?: string | null;
  title: string;
  brand?: string;
  category?: string;
  size: string;
  gtin?: string;
  price: number;
  count?: number;
  consignorId: string;
  taxonomyId?: string;
  imageData?: string;
  cost?: number;
}) {

  const product = await findOrCreateProduct({ sku, title, brand, category });
  const variant = await findOrCreateVariant({ productId: product.id, size, gtin });

  if (!variant.gtin && !gtin) {
    await ensureVariantBarcode(variant.id, { brand, category, size });
  }

  // Re-fetch: ensureVariantBarcode may have written a new gtin
  const freshVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });

  const listings = [];
  for (let i = 0; i < count; i++) {
    const listing = await prisma.listing.create({
      data: { consignorId, variantId: variant.id, price, cost: cost ?? null, listedAt: new Date() },
      include: { consignor: true },
    });
    listings.push(listing);
  }

  // Best-effort Shopify sync — listing is already saved locally
  try {
    const needsImage = !product.shopifyProductId && imageData;
    await ensureShopifyProductAndVariant({ admin, product, variant: freshVariant, taxonomyId, imageData: needsImage ? imageData : undefined });
    // Re-fetch: ensureShopify may have set shopifyVariantId/inventoryItemId
    const syncedVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });
    await syncInventory({ admin, variant: syncedVariant });
  } catch (err) {
    logger.error("Shopify sync failed (will retry on next operation)", { error: err instanceof Error ? err.message : String(err) });
  }

  return listings[0];
}

export async function cancelListing({
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

  if (listing.status !== LISTING_STATUS.ACTIVE) {
    throw new Error(`Cannot cancel listing with status "${listing.status}"`);
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: LISTING_STATUS.CANCELLED },
    include: { consignor: true },
  });

  await syncInventory({ admin, variant: listing.variant });

  return updated;
}

export async function restoreListing({
  admin,
  listingId,
}: {
  admin: AdminApiContext;
  listingId: string;
}) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { variant: true, consignor: true },
  });
  if (!listing) throw new Error("Listing not found");
  if (listing.status !== LISTING_STATUS.CANCELLED) throw new Error("Only cancelled listings can be restored");

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: LISTING_STATUS.ACTIVE },
    include: { consignor: true },
  });

  await syncInventory({ admin, variant: listing.variant });

  return updated;
}

/**
 * Bulk cancel listings: updates DB in one transaction, then syncs each
 * affected variant to Shopify once (not per listing) with retries.
 */
export async function bulkCancelListings({
  admin,
  listingIds,
}: {
  admin: AdminApiContext;
  listingIds: string[];
}): Promise<{ cancelled: number; failed: number; errors: string[] }> {
  // 1. Fetch all requested listings with their variants
  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds } },
    include: { variant: true },
  });

  // Filter to only active ones
  const cancellable = listings.filter((l) => l.status === LISTING_STATUS.ACTIVE);
  const skipped = listings.length - cancellable.length;

  if (cancellable.length === 0) {
    return { cancelled: 0, failed: skipped, errors: skipped > 0 ? ["No active listings to cancel"] : [] };
  }

  // 2. Batch update all statuses in a single transaction
  const cancellableIds = cancellable.map((l) => l.id);
  await prisma.listing.updateMany({
    where: { id: { in: cancellableIds } },
    data: { status: LISTING_STATUS.CANCELLED },
  });

  // 3. Collect unique variants that need Shopify sync
  const variantMap = new Map<string, typeof cancellable[0]["variant"]>();
  for (const listing of cancellable) {
    if (!variantMap.has(listing.variantId)) {
      variantMap.set(listing.variantId, listing.variant);
    }
  }

  // 4. Sync inventory once per variant with retry
  const errors: string[] = [];
  for (const [variantId, variant] of variantMap) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await syncInventory({ admin, variant });
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < 3) {
          // Wait before retry (exponential backoff: 500ms, 1500ms)
          await new Promise((r) => setTimeout(r, attempt * 500));
        } else {
          errors.push(`Shopify sync failed for variant ${variantId}: ${msg}`);
        }
      }
    }
  }

  return {
    cancelled: cancellable.length,
    failed: skipped + (errors.length > 0 ? 0 : 0), // DB cancel succeeded even if sync failed
    errors,
  };
}
