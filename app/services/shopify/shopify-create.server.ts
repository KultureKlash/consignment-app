import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { Product, Variant } from "@prisma/client";
import { resolveShopifyTaxonomyId } from "~/services/shopify/taxonomy.server";
import { parseCategory } from "~/lib/categories";
import { deriveProductMetafields } from "~/lib/deriveProductMetafields";
import { logger } from "~/lib/logger.server";

/** Convert our internal category ("Footwear > Sneakers" or "Sneakers") to a clean Shopify productType. */
function toShopifyProductType(category?: string | null): string | undefined {
  if (!category) return undefined;
  const { main, sub } = parseCategory(category);
  return sub || main;
}
import {
  reorderVariantsBySizes,
  deriveSku,
  uploadImageToShopify,
  getAllPublicationIds,
  pollForImageUrl,
  enableInventoryTracking,
} from "~/services/shopify/shopify-helpers.server";

/** Set age_group + target_gender metafields on a Shopify product */
export async function setProductMetafields(
  admin: AdminApiContext,
  shopifyProductId: string,
  product: Product,
  variant: Variant,
): Promise<void> {
  const { ageGroup, targetGender, sneakerStyles } = deriveProductMetafields(product.category, variant.size, product.title, product.brand);

  const metafields = [
    { ownerId: shopifyProductId, namespace: "shopify", key: "age-group", type: "list.metaobject_reference", value: JSON.stringify([ageGroup]) },
    { ownerId: shopifyProductId, namespace: "shopify", key: "target-gender", type: "list.metaobject_reference", value: JSON.stringify([targetGender]) },
  ];

  if (sneakerStyles.length > 0) {
    metafields.push({
      ownerId: shopifyProductId, namespace: "shopify", key: "sneaker-style", type: "list.metaobject_reference", value: JSON.stringify(sneakerStyles),
    });
  }

  const response = await admin.graphql(
    `#graphql
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`,
    { variables: { metafields } },
  );

  const { data } = await response.json();
  if (data.metafieldsSet.userErrors.length > 0) {
    logger.error("Failed to set product metafields", { shopifyProductId, errors: data.metafieldsSet.userErrors });
  }
}

/** Create a new Shopify product with first variant, taxonomy, image, and inventory tracking */
export async function createShopifyProduct(
  admin: AdminApiContext,
  product: Product,
  variant: Variant,
  opts: { taxonomyId?: string | null; imageData?: string }
): Promise<void> {
  const resolvedTaxonomyId = opts.taxonomyId ?? await resolveShopifyTaxonomyId(admin, product.category);
  const stagedImageUrl = opts.imageData ? await uploadImageToShopify(admin, opts.imageData) : undefined;

  const response = await admin.graphql(
    `#graphql
    mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
      productCreate(product: $product, media: $media) {
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
          ...(toShopifyProductType(product.category) ? { productType: toShopifyProductType(product.category) } : {}),
          ...(resolvedTaxonomyId ? { category: resolvedTaxonomyId } : {}),
          status: "ACTIVE",
          productOptions: [
            { name: "Size", values: [{ name: variant.size }] },
          ],
        },
        ...(stagedImageUrl ? { media: [{ originalSource: stagedImageUrl, mediaContentType: "IMAGE" }] } : {}),
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
  const publishRes = await admin.graphql(
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
  const publishData = await publishRes.json();
  if (publishData.data.publishablePublish.userErrors.length > 0) {
    logger.error("Shopify publishablePublish failed", { shopifyProductId: shopifyProduct.id, errors: publishData.data.publishablePublish.userErrors });
  }

  // Poll for processed image URL if we uploaded one
  const finalImageUrl = stagedImageUrl
    ? await pollForImageUrl(admin, shopifyProduct.id)
    : null;

  // Enable inventory tracking + activate at primary location
  await enableInventoryTracking(admin, shopifyVariant.inventoryItem.id);

  // Double-check: another request may have synced while we called Shopify API
  const checkProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  if (checkProduct.shopifyProductId) return;

  // Persist Shopify IDs locally
  await Promise.all([
    prisma.product.update({
      where: { id: product.id },
      data: {
        shopifyProductId: shopifyProduct.id,
        ...(finalImageUrl ? { imageUrl: finalImageUrl } : {}),
      },
    }),
    prisma.variant.update({
      where: { id: variant.id },
      data: {
        shopifyVariantId: shopifyVariant.id,
        inventoryItemId: shopifyVariant.inventoryItem.id,
      },
    }),
  ]);

  // Set barcode on the variant + SKU on the inventory item
  const sku = deriveSku(product, variant);
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
    if (barcodeData.data.productVariantsBulkUpdate.userErrors.length > 0) {
      logger.error("Shopify barcode update failed", { variantId: variant.id, errors: barcodeData.data.productVariantsBulkUpdate.userErrors });
    }
  }
  if (sku) {
    const skuRes = await admin.graphql(
      `#graphql
      mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) {
          userErrors { field message }
        }
      }`,
      { variables: { id: shopifyVariant.inventoryItem.id, input: { sku } } }
    );
    const skuData = await skuRes.json();
    if (skuData.data.inventoryItemUpdate.userErrors.length > 0) {
      logger.error("Shopify SKU update failed", { variantId: variant.id, sku, errors: skuData.data.inventoryItemUpdate.userErrors });
    }
  }
}

/** Add a new variant (size) to an existing Shopify product */
export async function addVariantToExistingProduct(
  admin: AdminApiContext,
  shopifyProductId: string,
  variant: Variant,
  product: Product
): Promise<void> {
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
        productId: shopifyProductId,
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

  // Enable inventory tracking + set SKU
  const variantSku = deriveSku(product, variant);
  await enableInventoryTracking(
    admin,
    shopifyVariant.inventoryItem.id,
    variantSku ? { sku: variantSku } : undefined
  );

  // Persist Shopify IDs locally
  await prisma.variant.update({
    where: { id: variant.id },
    data: {
      shopifyVariantId: shopifyVariant.id,
      inventoryItemId: shopifyVariant.inventoryItem.id,
    },
  });

  // Reorder size options so they display sorted in Shopify
  try {
    await reorderVariantsBySizes(admin, shopifyProductId);
  } catch (err) {
    logger.error("Failed to reorder size options", { error: err instanceof Error ? err.message : String(err) });
  }
}
