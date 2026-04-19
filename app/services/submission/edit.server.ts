import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { updateShopifyProductImage, updateShopifyProduct } from "~/services/shopify/products.server";
import { syncInventory } from "~/services/inventory.server";
import { LISTING_STATUS, TERMINAL_STATUSES } from "~/lib/listing-statuses";
import { TRANSACTION_TYPE } from "~/lib/order-statuses";
import { logger } from "~/lib/logger.server";

// ── Admin: Edit product-level fields (title, brand, category, image) ──

export async function adminEditProduct({
  admin,
  productId,
  title,
  brand,
  category,
  sku,
  imageData,
}: {
  admin: AdminApiContext;
  productId: string;
  title?: string;
  brand?: string;
  category?: string;
  sku?: string;
  imageData?: string;
}) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Product not found");

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(brand !== undefined ? { brand: brand || null } : {}),
      ...(category !== undefined ? { category: category || null } : {}),
      ...(sku !== undefined ? { sku: sku || null } : {}),
    },
  });

  if (imageData && updated.shopifyProductId) {
    try {
      await updateShopifyProductImage({ admin, productId, shopifyProductId: updated.shopifyProductId, imageData });
    } catch (err) {
      logger.error("Image upload to Shopify failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (updated.shopifyProductId) {
    try {
      await updateShopifyProduct({ admin, product: updated });
    } catch (err) {
      logger.error("Shopify product update failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return updated;
}

// ── Admin: Update cost on any listing (including sold) ──

export async function updateListingCost({
  listingId,
  cost,
}: {
  listingId: string;
  cost: number;
}) {
  // Update the listing cost
  const listing = await prisma.listing.update({
    where: { id: listingId },
    data: { cost },
    include: { consignor: true, variant: { include: { product: true } } },
  });

  // Also update transaction cost snapshots so order detail / dashboard recalculates
  await prisma.transaction.updateMany({
    where: {
      orderItem: { listingId },
      type: TRANSACTION_TYPE.SALE,
    },
    data: { cost },
  });

  return listing;
}

// ── Admin: Edit listing (variant-level fields) without changing status ──

export async function adminEditListing({
  admin,
  listingId,
  size,
  gtin,
  price,
  cost,
}: {
  admin?: AdminApiContext;
  listingId: string;
  size?: string;
  gtin?: string;
  price?: number;
  cost?: number | null;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: { include: { product: true } }, consignor: true },
  });

  if (TERMINAL_STATUSES.includes(listing.status)) {
    throw new Error(`Cannot edit listing with status "${listing.status}"`);
  }

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

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      ...(price !== undefined ? { price } : {}),
      ...(cost !== undefined ? { cost } : {}),
    },
    include: { consignor: true, variant: { include: { product: true } } },
  });

  if (admin && [LISTING_STATUS.ACTIVE, LISTING_STATUS.PENDING_SALE].includes(listing.status as any) && updated.variant.shopifyVariantId) {
    const shopifyProductId = updated.variant.product.shopifyProductId;
    if (shopifyProductId) {
      try {
        const variantInput: Record<string, unknown> = { id: updated.variant.shopifyVariantId };
        if (gtin !== undefined) variantInput.barcode = gtin || "";
        if (size && size !== listing.variant.size) {
          variantInput.optionValues = [{ name: size, optionName: "Size" }];
        }

        await admin.graphql(
          `mutation variantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              productVariants { id title barcode }
              userErrors { field message }
            }
          }`,
          { variables: { productId: shopifyProductId, variants: [variantInput] } },
        );

        await syncInventory({ admin, variant: updated.variant });
      } catch (err) {
        logger.error("Shopify sync after listing edit failed", { error: err instanceof Error ? err.message : String(err), listingId });
      }
    }
  }

  return updated;
}
