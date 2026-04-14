import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { Variant } from "@prisma/client";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { logger } from "~/lib/logger.server";

export async function getPrimaryLocationId(admin: AdminApiContext): Promise<string> {
  const response = await admin.graphql(`#graphql
    query {
      locations(first: 1) {
        nodes { id }
      }
    }
  `);
  const { data } = await response.json();
  return data.locations.nodes[0].id;
}

export async function syncInventory({
  admin,
  variant: variantInput,
}: {
  admin: AdminApiContext;
  variant: Variant;
}): Promise<void> {
  // Re-read variant from DB to get fresh Shopify IDs
  // (they may have been cleared by a previous delete or updated by another operation)
  const variant = await prisma.variant.findUniqueOrThrow({
    where: { id: variantInput.id },
  });

  if (!variant.inventoryItemId) return;

  // Find the lowest active price for this variant
  const lowestListing = await prisma.listing.findFirst({
    where: { variantId: variant.id, status: LISTING_STATUS.ACTIVE },
    orderBy: { price: "asc" },
    select: { price: true },
  });

  let totalQuantity: number;
  if (!lowestListing) {
    totalQuantity = 0;
  } else {
    // Count active listings at the lowest price tier (per-item model: each listing = 1 unit)
    totalQuantity = await prisma.listing.count({
      where: { variantId: variant.id, status: LISTING_STATUS.ACTIVE, price: lowestListing.price },
    });
  }

  const locationId = await getPrimaryLocationId(admin);

  const response = await admin.graphql(
    `#graphql
    mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup {
          reason
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: [
            {
              inventoryItemId: variant.inventoryItemId,
              locationId,
              quantity: totalQuantity,
            },
          ],
        },
      },
    }
  );

  const { data } = await response.json();
  const { userErrors } = data.inventorySetQuantities;
  if (userErrors.length > 0) {
    throw new Error(`Shopify inventorySetQuantities error: ${userErrors[0].message}`);
  }

  // Sync price or delete variant from Shopify
  if (!variant.shopifyVariantId) return;

  const product = await prisma.product.findUniqueOrThrow({
    where: { id: variant.productId },
  });

  if (!product.shopifyProductId) return;

  // If no active listings, delete the Shopify variant to avoid $0 price polluting sort
  if (totalQuantity === 0) {
    const siblingCount = await prisma.variant.count({
      where: {
        productId: variant.productId,
        shopifyVariantId: { not: null },
      },
    });

    if (siblingCount > 1) {
      // Safe to delete — other variants still exist on the product
      await admin.graphql(
        `#graphql
        mutation productVariantsBulkDelete($productId: ID!, $variantsIds: [ID!]!) {
          productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
            userErrors { field message }
          }
        }`,
        {
          variables: {
            productId: product.shopifyProductId,
            variantsIds: [variant.shopifyVariantId],
          },
        }
      );

      // Clear Shopify IDs — variant row stays for future re-creation
      await prisma.variant.update({
        where: { id: variant.id },
        data: { shopifyVariantId: null, inventoryItemId: null },
      });

      return;
    }
    // Last variant on product — can't delete, just set price to $0
  }

  // Sync lowest-ask price to Shopify variant (lowestListing already fetched above)
  const priceResponse = await admin.graphql(
    `#graphql
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        productId: product.shopifyProductId,
        variants: [{
          id: variant.shopifyVariantId,
          price: lowestListing ? String(lowestListing.price) : "0",
        }],
      },
    }
  );

  const priceData = await priceResponse.json();
  const priceErrors = priceData.data.productVariantsBulkUpdate.userErrors;
  if (priceErrors.length > 0) {
    throw new Error(`Shopify price sync error: ${priceErrors[0].message}`);
  }
}

/** Best-effort Shopify inventory sync — logs errors instead of throwing. */
export async function safeSyncInventory({
  admin,
  variant,
  context,
}: {
  admin: AdminApiContext;
  variant: Variant;
  context?: string;
}): Promise<void> {
  try {
    await syncInventory({ admin, variant });
  } catch (err) {
    logger.error(`Shopify sync failed${context ? ` during ${context}` : ""}`, { error: err instanceof Error ? err.message : String(err) });
  }
}
