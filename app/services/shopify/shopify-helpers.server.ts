import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { getPrimaryLocationId } from "~/services/inventory";
import { compareSizes } from "~/lib/size-order";
import { logger } from "~/lib/logger.server";
import type { Product, Variant } from "@prisma/client";

/** Reorder variants on a Shopify product so sizes display in logical order */
export async function reorderVariantsBySizes(admin: AdminApiContext, shopifyProductId: string) {
  const res = await admin.graphql(
    `#graphql
    query productVariants($id: ID!) {
      product(id: $id) {
        variants(first: 100) {
          nodes {
            id
            selectedOptions { name value }
          }
        }
      }
    }`,
    { variables: { id: shopifyProductId } }
  );
  const { data } = await res.json();
  const variants = data.product?.variants?.nodes;
  if (!variants || variants.length < 2) return;

  const withSize = variants.map((v: any) => ({
    id: v.id,
    size: v.selectedOptions.find((o: any) => o.name === "Size")?.value ?? "",
  }));
  const sorted = [...withSize].sort((a: any, b: any) => compareSizes(a.size, b.size));

  // Skip if already in order
  if (sorted.every((v: any, i: number) => v.id === withSize[i].id)) return;

  const reorderRes = await admin.graphql(
    `#graphql
    mutation productVariantsBulkReorder($productId: ID!, $positions: [ProductVariantPositionInput!]!) {
      productVariantsBulkReorder(productId: $productId, positions: $positions) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        productId: shopifyProductId,
        positions: sorted.map((v: any, i: number) => ({ id: v.id, position: i + 1 })),
      },
    }
  );
  const reorderData = await reorderRes.json();
  const reorderErrors = reorderData.data?.productVariantsBulkReorder?.userErrors;
  if (reorderErrors?.length > 0) {
    logger.error("Variant reorder failed", { errors: reorderErrors });
  }
}

export function deriveSku(product: Product, variant: Variant): string {
  const isFootwear = !product.category || product.category.startsWith("Footwear");
  if (isFootwear && product.sku) return product.sku;
  return variant.gtin || "";
}

export async function uploadImageToShopify(
  admin: AdminApiContext,
  base64DataUrl: string
): Promise<string> {
  // Decode base64 data URL → Buffer
  const base64Body = base64DataUrl.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Body, "base64");
  const mimeType = base64DataUrl.match(/^data:(image\/\w+);/)?.[1] ?? "image/jpeg";
  const filename = `product-image.${mimeType === "image/png" ? "png" : "jpg"}`;

  // Get presigned upload URL from Shopify
  const stagedRes = await admin.graphql(
    `#graphql
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: [{
          resource: "IMAGE",
          filename,
          mimeType,
          fileSize: String(buffer.length),
          httpMethod: "POST",
        }],
      },
    }
  );
  const stagedData = await stagedRes.json();
  const errors = stagedData.data.stagedUploadsCreate.userErrors;
  if (errors.length > 0) {
    throw new Error(`Staged upload error: ${errors[0].message}`);
  }
  const target = stagedData.data.stagedUploadsCreate.stagedTargets[0];

  // Upload image to presigned URL
  const formData = new FormData();
  for (const { name, value } of target.parameters) {
    formData.append(name, value);
  }
  formData.append("file", new Blob([buffer], { type: mimeType }), filename);
  await fetch(target.url, { method: "POST", body: formData });

  return target.resourceUrl;
}

export async function getAllPublicationIds(admin: AdminApiContext): Promise<string[]> {
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

/** Poll Shopify until the product's first image is processed and return its CDN URL */
export async function pollForImageUrl(
  admin: AdminApiContext,
  shopifyProductId: string
): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const imgRes = await admin.graphql(
      `#graphql
      query productImages($id: ID!) {
        product(id: $id) {
          images(first: 1) { nodes { url } }
        }
      }`,
      { variables: { id: shopifyProductId } }
    );
    const imgData = await imgRes.json();
    const url = imgData.data.product?.images?.nodes?.[0]?.url ?? null;
    if (url) return url;
  }
  return null;
}

/** Upload product image via staged uploads, attach to product, and poll for processed CDN URL */
export async function uploadProductImage(
  admin: AdminApiContext,
  shopifyProductId: string,
  imageData: string
): Promise<string | null> {
  const stagedUrl = await uploadImageToShopify(admin, imageData);

  const mediaRes = await admin.graphql(
    `#graphql
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { id }
        mediaUserErrors { field message }
      }
    }`,
    {
      variables: {
        productId: shopifyProductId,
        media: [{ originalSource: stagedUrl, mediaContentType: "IMAGE" }],
      },
    }
  );
  const mediaData = await mediaRes.json();
  if (mediaData.data.productCreateMedia.mediaUserErrors.length > 0) {
    logger.error("Shopify productCreateMedia failed", { shopifyProductId, errors: mediaData.data.productCreateMedia.mediaUserErrors });
  }

  return pollForImageUrl(admin, shopifyProductId);
}

/** Enable inventory tracking on a variant and activate at primary location */
export async function enableInventoryTracking(
  admin: AdminApiContext,
  inventoryItemId: string,
  extraInput?: Record<string, unknown>
): Promise<void> {
  await admin.graphql(
    `#graphql
    mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    { variables: { id: inventoryItemId, input: { tracked: true, ...extraInput } } }
  );

  const locationId = await getPrimaryLocationId(admin);
  const activateRes = await admin.graphql(
    `#graphql
    mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
      inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
        inventoryLevel { id }
        userErrors { field message }
      }
    }`,
    { variables: { inventoryItemId: inventoryItemId, locationId } }
  );
  await activateRes.json();
}
