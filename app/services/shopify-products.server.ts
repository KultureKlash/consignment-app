import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { Product, Variant } from "@prisma/client";
import { resolveShopifyTaxonomyId } from "~/services/shopify-taxonomy.server";
import { getPrimaryLocationId } from "~/services/inventory.server";
import { compareSizes } from "~/lib/size-order";

/** Reorder variants on a Shopify product so sizes display in logical order */
async function reorderVariantsBySizes(admin: AdminApiContext, shopifyProductId: string) {
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
    console.error("Variant reorder failed:", reorderErrors);
  }
}

function deriveSku(product: Product, variant: Variant): string {
  const isFootwear = !product.category || product.category.startsWith("Footwear");
  if (isFootwear && product.styleId) return product.styleId;
  return variant.gtin || "";
}

async function uploadImageToShopify(
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
  taxonomyId,
  imageData,
}: {
  admin: AdminApiContext;
  product: Product;
  variant: Variant;
  taxonomyId?: string | null;
  imageData?: string;
}): Promise<void> {
  // Both already synced — nothing to do
  if (product.shopifyProductId && variant.shopifyVariantId) return;

  // Product not in Shopify — create product + first variant in one call
  if (!product.shopifyProductId) {
    // Resolve Shopify taxonomy ID: prefer explicit override, fallback to auto-resolve from category
    const resolvedTaxonomyId = taxonomyId ?? await resolveShopifyTaxonomyId(admin, product.category);

    // Upload image via staged uploads if provided (Shopify doesn't accept base64 data URLs directly)
    const stagedImageUrl = imageData ? await uploadImageToShopify(admin, imageData) : undefined;

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
            ...(product.category ? { productType: product.category } : {}),
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

    // Poll for processed image URL (Shopify media processing is async)
    let shopifyImageUrl: string | null = null;
    if (stagedImageUrl) {
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        const imgRes = await admin.graphql(
          `#graphql
          query productImages($id: ID!) {
            product(id: $id) {
              images(first: 1) { nodes { url } }
            }
          }`,
          { variables: { id: shopifyProduct.id } }
        );
        const imgData = await imgRes.json();
        shopifyImageUrl = imgData.data.product?.images?.nodes?.[0]?.url ?? null;
        if (shopifyImageUrl) break;
      }
    }

    // Enable inventory tracking FIRST — must complete before syncInventory runs
    await admin.graphql(
      `#graphql
      mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) {
          userErrors { field message }
        }
      }`,
      { variables: { id: shopifyVariant.inventoryItem.id, input: { tracked: true } } }
    );

    // Activate inventory at the primary location (required before inventorySetQuantities works)
    const locationId = await getPrimaryLocationId(admin);
    const activateRes = await admin.graphql(
      `#graphql
      mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
        inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
          inventoryLevel { id }
          userErrors { field message }
        }
      }`,
      { variables: { inventoryItemId: shopifyVariant.inventoryItem.id, locationId } }
    );
    await activateRes.json();

    await Promise.all([
      prisma.product.update({
        where: { id: product.id },
        data: {
          shopifyProductId: shopifyProduct.id,
          ...(shopifyImageUrl ? { imageUrl: shopifyImageUrl } : {}),
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
      await admin.graphql(
        `#graphql
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id barcode }
            userErrors { field message }
          }
        }`,
        { variables: { productId: shopifyProduct.id, variants: [{ id: shopifyVariant.id, barcode: variant.gtin }] } }
      );
    }
    if (sku) {
      await admin.graphql(
        `#graphql
        mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
          inventoryItemUpdate(id: $id, input: $input) {
            userErrors { field message }
          }
        }`,
        { variables: { id: shopifyVariant.inventoryItem.id, input: { sku } } }
      );
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

  // Enable inventory tracking + set SKU on the inventory item
  const variantSku = deriveSku(product, variant);
  await admin.graphql(
    `#graphql
    mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    { variables: { id: shopifyVariant.inventoryItem.id, input: { tracked: true, ...(variantSku ? { sku: variantSku } : {}) } } }
  );

  // Activate inventory at the primary location (required before inventorySetQuantities works)
  const locationId = await getPrimaryLocationId(admin);
  await admin.graphql(
    `#graphql
    mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
      inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
        inventoryLevel { id }
        userErrors { field message }
      }
    }`,
    { variables: { inventoryItemId: shopifyVariant.inventoryItem.id, locationId } }
  );

  await prisma.variant.update({
    where: { id: variant.id },
    data: {
      shopifyVariantId: shopifyVariant.id,
      inventoryItemId: shopifyVariant.inventoryItem.id,
    },
  });

  // Reorder size options so they display sorted in Shopify
  try {
    await reorderVariantsBySizes(admin, product.shopifyProductId!);
  } catch (err) {
    console.error("Failed to reorder size options:", err);
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
