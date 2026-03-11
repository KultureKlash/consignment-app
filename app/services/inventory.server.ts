import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { Variant } from "@prisma/client";

async function getPrimaryLocationId(admin: AdminApiContext): Promise<string> {
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
  variant,
}: {
  admin: AdminApiContext;
  variant: Variant;
}): Promise<void> {
  if (!variant.inventoryItemId) return;

  const agg = await prisma.listing.aggregate({
    where: { variantId: variant.id, status: "active" },
    _sum: { quantity: true },
  });
  const totalQuantity = agg._sum.quantity ?? 0;

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
}
