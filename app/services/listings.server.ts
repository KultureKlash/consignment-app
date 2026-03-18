import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { findOrCreateProduct, findOrCreateVariant } from "~/services/catalog.server";
import { ensureShopifyProductAndVariant } from "~/services/shopify-products.server";
import { syncInventory } from "~/services/inventory.server";

export async function createListing({
  admin,
  styleId,
  title,
  brand,
  size,
  gtin,
  price,
  count = 1,
  consignorId,
}: {
  admin: AdminApiContext;
  styleId: string;
  title: string;
  brand?: string;
  size: string;
  gtin: string;
  price: number;
  count?: number;
  consignorId: string;
}) {

  // 1️⃣ Find or create product in DB
  const product = await findOrCreateProduct({ styleId, title, brand });

  // 2️⃣ Find or create variant in DB
  const variant = await findOrCreateVariant({ productId: product.id, size, gtin });

  // 3️⃣ Ensure product + variant exist in Shopify
  await ensureShopifyProductAndVariant({ admin, product, variant });

  // Re-fetch variant to get updated inventoryItemId written by ensureShopifyProductAndVariant
  const syncedVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });

  // 4️⃣ Create N individual listings (per-item model: each listing = 1 physical item)
  const listings = [];
  for (let i = 0; i < count; i++) {
    const listing = await prisma.listing.create({
      data: { consignorId, variantId: variant.id, price, listedAt: new Date() },
      include: { consignor: true },
    });
    listings.push(listing);
  }

  // 5️⃣ Sync inventory to Shopify
  await syncInventory({ admin, variant: syncedVariant });

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
