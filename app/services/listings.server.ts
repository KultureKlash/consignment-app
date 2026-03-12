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
  price,
  quantity,
  consignorId,
}: {
  admin: AdminApiContext;
  styleId: string;
  title: string;
  brand?: string;
  size: string;
  price: number;
  quantity: number;
  consignorId: string;
}) {

  // 1️⃣ Find or create product in DB
  const product = await findOrCreateProduct({ styleId, title, brand });

  // 2️⃣ Find or create variant in DB
  const variant = await findOrCreateVariant({ productId: product.id, size });

  // 3️⃣ Ensure product + variant exist in Shopify
  await ensureShopifyProductAndVariant({ admin, product, variant });

  // Re-fetch variant to get updated inventoryItemId written by ensureShopifyProductAndVariant
  const syncedVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });

  // 4️⃣ Upsert listing: merge if same consignor+variant+price already active
  const existingListing = await prisma.listing.findFirst({
    where: {
      consignorId,
      variantId: variant.id,
      price,
      status: "active",
    },
  });

  let listing;
  if (existingListing) {
    listing = await prisma.listing.update({
      where: { id: existingListing.id },
      data: { quantity: existingListing.quantity + quantity },
      include: { consignor: true },
    });
  } else {
    listing = await prisma.listing.create({
      data: { consignorId, variantId: variant.id, price, quantity },
      include: { consignor: true },
    });
  }

  // 5️⃣ Sync inventory to Shopify
  await syncInventory({ admin, variant: syncedVariant });

  return listing;
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

export async function updateListingQuantity({
  admin,
  listingId,
  quantity,
}: {
  admin: AdminApiContext;
  listingId: string;
  quantity: number;
}) {
  if (quantity < 0) {
    throw new Error("Quantity cannot be negative");
  }

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: true },
  });

  if (listing.status !== "active") {
    throw new Error(`Cannot update listing with status "${listing.status}"`);
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      quantity,
      ...(quantity === 0 ? { status: "cancelled" } : {}),
    },
    include: { consignor: true },
  });

  await syncInventory({ admin, variant: listing.variant });

  return updated;
}
