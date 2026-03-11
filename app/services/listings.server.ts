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

  // 4️⃣ Create listing
  const listing = await prisma.listing.create({
    data: {
      consignorId,
      variantId: variant.id,
      price,
      quantity,
    },
    include: { consignor: true },
  });

  // 5️⃣ Sync inventory to Shopify
  await syncInventory({ admin, variant: syncedVariant });

  return listing;
}
