import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { Product } from "@prisma/client";
import { resolveShopifyTaxonomyId } from "~/services/shopify/taxonomy.server";
import { parseCategory } from "~/lib/categories";
import { logger } from "~/lib/logger.server";
import { uploadProductImage } from "~/services/shopify/shopify-helpers.server";
import {
  createShopifyProduct,
  addVariantToExistingProduct,
  setProductMetafields,
} from "~/services/shopify/shopify-create.server";

/**
 * Update an existing Shopify product's title, vendor (brand), and category.
 * Only called when the product has a shopifyProductId.
 */
export async function updateShopifyProduct({
  admin,
  product,
}: {
  admin: AdminApiContext;
  product: Product;
}) {
  if (!product.shopifyProductId) return;

  const taxonomyId = await resolveShopifyTaxonomyId(admin, product.category);
  const productType = product.category
    ? (parseCategory(product.category).sub ?? parseCategory(product.category).main)
    : undefined;

  const response = await admin.graphql(
    `mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title vendor }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: {
          id: product.shopifyProductId,
          title: product.title,
          vendor: product.brand || undefined,
          ...(productType ? { productType } : {}),
          ...(taxonomyId ? { category: taxonomyId } : {}),
        },
      },
    },
  );

  const { data } = await response.json();
  if (data.productUpdate?.userErrors?.length > 0) {
    logger.error("Shopify productUpdate errors", { errors: data.productUpdate.userErrors });
  }

  // Re-sync metafields when category changes
  const firstVariant = await prisma.variant.findFirst({ where: { productId: product.id }, orderBy: { createdAt: "asc" } });
  if (firstVariant) {
    await setProductMetafields(admin, product.shopifyProductId, product, firstVariant);
  }
}

export async function ensureShopifyProductAndVariant({
  admin,
  product,
  variant,
  taxonomyId,
  imageData,
}: {
  admin: AdminApiContext;
  product: Product;
  variant: import("@prisma/client").Variant;
  taxonomyId?: string | null;
  imageData?: string;
}): Promise<void> {
  // Re-read from DB to get latest Shopify IDs (another request may have synced)
  const freshProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  const freshVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });

  if (freshProduct.shopifyProductId && freshVariant.shopifyVariantId) return;

  // Product not in Shopify — create product + first variant + metafields
  if (!freshProduct.shopifyProductId) {
    await createShopifyProduct(admin, freshProduct, freshVariant, { taxonomyId, imageData });
    const afterCreate = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    if (afterCreate.shopifyProductId) {
      await setProductMetafields(admin, afterCreate.shopifyProductId, afterCreate, freshVariant);
    }
    return;
  }

  // Product exists in Shopify but this variant doesn't — add the new size
  await addVariantToExistingProduct(admin, freshProduct.shopifyProductId, freshVariant, freshProduct);
}

/**
 * Update the image on an existing Shopify product.
 * Uploads base64 image via staged uploads, attaches to product, polls for CDN URL,
 * and updates local product.imageUrl.
 */
export async function updateShopifyProductImage({
  admin,
  productId,
  shopifyProductId,
  imageData,
}: {
  admin: AdminApiContext;
  productId: string;
  shopifyProductId: string;
  imageData: string;
}): Promise<void> {
  // 1. Delete all existing images first
  const existingRes = await admin.graphql(
    `#graphql
    query productMedia($id: ID!) {
      product(id: $id) {
        media(first: 20) {
          nodes { id }
        }
      }
    }`,
    { variables: { id: shopifyProductId } }
  );
  const existingData = await existingRes.json();
  const existingMediaIds = existingData.data.product?.media?.nodes?.map((n: { id: string }) => n.id) ?? [];

  if (existingMediaIds.length > 0) {
    await admin.graphql(
      `#graphql
      mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          deletedMediaIds
          mediaUserErrors { field message }
        }
      }`,
      {
        variables: {
          productId: shopifyProductId,
          mediaIds: existingMediaIds,
        },
      }
    );
  }

  // 2. Upload, attach, and poll for processed image URL
  const shopifyImageUrl = await uploadProductImage(admin, shopifyProductId, imageData);

  // 3. Update local product with CDN URL (replacing base64)
  if (shopifyImageUrl) {
    await prisma.product.update({
      where: { id: productId },
      data: { imageUrl: shopifyImageUrl },
    });
  }
}

export async function backfillProductImages(admin: AdminApiContext): Promise<number> {
  const products = await prisma.product.findMany({
    where: { shopifyProductId: { not: null }, imageUrl: null },
  });

  let updated = 0;
  for (const product of products) {
    const res = await admin.graphql(
      `#graphql
      query productImages($id: ID!) {
        product(id: $id) {
          images(first: 1) { nodes { url } }
        }
      }`,
      { variables: { id: product.shopifyProductId } }
    );
    const data = await res.json();
    const url = data.data.product?.images?.nodes?.[0]?.url ?? null;
    if (url) {
      await prisma.product.update({
        where: { id: product.id },
        data: { imageUrl: url },
      });
      updated++;
    }
  }
  return updated;
}
