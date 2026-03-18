import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { Product, Variant } from "@prisma/client";

async function getAllPublicationIds(admin: AdminApiContext): Promise<string[]> {
  const response = await admin.graphql(`#graphql
    query {
      publications(first: 10) {
        nodes { id name }
      }
    }
  `);
  const { data } = await response.json();
  return data.publications.nodes.map((p: { id: string }) => p.id);
}

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
            ...(product.brand ? { vendor: product.brand } : {}),
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

    // Publish to all sales channels so it appears on storefront, Shop app, POS
    const publicationIds = await getAllPublicationIds(admin);
    await admin.graphql(
      `#graphql
      mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors { field message }
        }
      }`,
      {
        variables: {
          id: shopifyProduct.id,
          input: publicationIds.map((publicationId) => ({ publicationId })),
        },
      }
    );

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

    // Set barcode (GTIN) on the auto-created variant (must run after product is fully committed)
    if (variant.gtin) {
      const barcodeRes = await admin.graphql(
        `#graphql
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id barcode }
            userErrors { field message }
          }
        }`,
        { variables: { productId: shopifyProduct.id, variants: [{ id: shopifyVariant.id, barcode: variant.gtin }] } }
      );
      const barcodeData = await barcodeRes.json();
      const barcodeErrors = barcodeData.data.productVariantsBulkUpdate.userErrors;
      if (barcodeErrors.length > 0) {
        console.error("Barcode sync error:", barcodeErrors);
      }
    }

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
          {
            optionValues: [{ name: variant.size, optionName: "Size" }],
            barcode: variant.gtin || "",
          },
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
