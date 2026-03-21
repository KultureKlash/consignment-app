import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { findOrCreateProduct, findOrCreateVariant } from "~/services/catalog.server";
import { ensureShopifyProductAndVariant } from "~/services/shopify-products.server";
import { syncInventory } from "~/services/inventory.server";
import { generateBarcode, parseCategory } from "~/lib/categories";

export async function createListing({
  admin,
  styleId,
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
}: {
  admin: AdminApiContext;
  styleId?: string | null;
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
}) {

  // 1️⃣ Find or create product in DB
  const product = await findOrCreateProduct({ styleId, title, brand, category });

  // 2️⃣ Find or create variant in DB
  const variant = await findOrCreateVariant({ productId: product.id, size, gtin });

  // 3️⃣ Auto-generate barcode for non-footwear if not provided
  if (!variant.gtin && !gtin) {
    const sub = category ? parseCategory(category).sub : undefined;
    let barcode: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = generateBarcode(brand, sub, size);
      const existing = await prisma.variant.findUnique({ where: { gtin: candidate } });
      if (!existing) { barcode = candidate; break; }
    }
    if (!barcode) throw new Error("Failed to generate unique barcode after 3 attempts");
    await prisma.variant.update({
      where: { id: variant.id },
      data: { gtin: barcode },
    });
  }

  // Re-fetch variant to include auto-generated barcode
  const freshVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });

  // 4️⃣ Create listings FIRST (local DB, always succeeds)
  const listings = [];
  for (let i = 0; i < count; i++) {
    const listing = await prisma.listing.create({
      data: { consignorId, variantId: variant.id, price, listedAt: new Date() },
      include: { consignor: true },
    });
    listings.push(listing);
  }

  // 5️⃣ Shopify sync (best-effort — don't block listing creation)
  try {
    // Only pass image for new products (no Shopify product yet or no image)
    const needsImage = !product.shopifyProductId && imageData;
    await ensureShopifyProductAndVariant({ admin, product, variant: freshVariant, taxonomyId, imageData: needsImage ? imageData : undefined });
    const syncedVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });
    await syncInventory({ admin, variant: syncedVariant });
  } catch (err) {
    console.error("Shopify sync failed (will retry on next operation):", err);
  }

  // Return first listing for backward compat with single-item callers
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

  if (listing.status !== "active") {
    throw new Error(`Cannot cancel listing with status "${listing.status}"`);
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: "cancelled" },
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
  const cancellable = listings.filter((l) => l.status === "active");
  const skipped = listings.length - cancellable.length;

  if (cancellable.length === 0) {
    return { cancelled: 0, failed: skipped, errors: skipped > 0 ? ["No active listings to cancel"] : [] };
  }

  // 2. Batch update all statuses in a single transaction
  const cancellableIds = cancellable.map((l) => l.id);
  await prisma.listing.updateMany({
    where: { id: { in: cancellableIds } },
    data: { status: "cancelled" },
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
