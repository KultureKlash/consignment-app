import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { Product, Variant } from "@prisma/client";

export async function ensureShopifyProductAndVariant({
  admin,
  product,
  variant,
}: {
  admin: AdminApiContext;
  product: Product;
  variant: Variant;
}): Promise<void> {
  // Both already synced — nothing to do
  if (product.shopifyProductId && variant.shopifyVariantId) return;

  // Product not in Shopify — create product + first variant in one call
  if (!product.shopifyProductId) {
    const response = await admin.graphql(
      `#graphql
      mutation productCreate($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            variants(first: 1) {
              nodes {
                id
                inventoryItem {
                  id
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          product: {
            title: product.title,
            status: "ACTIVE",
            productOptions: [
              { name: "Size", values: [{ name: variant.size }] },
            ],
          },
        },
      }
    );

    const { data } = await response.json();
    const { product: shopifyProduct, userErrors } = data.productCreate;

    if (userErrors.length > 0) {
      throw new Error(`Shopify productCreate error: ${userErrors[0].message}`);
    }

    const shopifyVariant = shopifyProduct.variants.nodes[0];

    await Promise.all([
      prisma.product.update({
        where: { id: product.id },
        data: { shopifyProductId: shopifyProduct.id },
      }),
      prisma.variant.update({
        where: { id: variant.id },
        data: {
          shopifyVariantId: shopifyVariant.id,
          inventoryItemId: shopifyVariant.inventoryItem.id,
        },
      }),
      admin.graphql(
        `#graphql
        mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
          inventoryItemUpdate(id: $id, input: $input) {
            userErrors { field message }
          }
        }`,
        { variables: { id: shopifyVariant.inventoryItem.id, input: { tracked: true } } }
      ),
    ]);

    return;
  }

  // Product exists in Shopify but this variant doesn't — add the new size
  const response = await admin.graphql(
    `#graphql
    mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants) {
        productVariants {
          id
          inventoryItem {
            id
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        productId: product.shopifyProductId,
        variants: [
          { optionValues: [{ name: variant.size, optionName: "Size" }] },
        ],
      },
    }
  );

  const { data } = await response.json();
  const { productVariants, userErrors } = data.productVariantsBulkCreate;

  if (userErrors.length > 0) {
    throw new Error(
      `Shopify productVariantsBulkCreate error: ${userErrors[0].message}`
    );
  }

  const shopifyVariant = productVariants[0];

  await Promise.all([
    prisma.variant.update({
      where: { id: variant.id },
      data: {
        shopifyVariantId: shopifyVariant.id,
        inventoryItemId: shopifyVariant.inventoryItem.id,
      },
    }),
    admin.graphql(
      `#graphql
      mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) {
          userErrors { field message }
        }
      }`,
      { variables: { id: shopifyVariant.inventoryItem.id, input: { tracked: true } } }
    ),
  ]);
}
