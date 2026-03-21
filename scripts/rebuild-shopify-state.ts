/**
 * Repair job: reads DB as source of truth → verifies Shopify state → fixes discrepancies.
 * Clears stale Shopify IDs for missing products/variants so the next sync recreates them.
 * Recalculates inventory + prices for existing variants.
 *
 * IMPORTANT: Run this while `shopify app dev` is NOT running (to avoid conflicts).
 *
 * Run: npx tsx scripts/rebuild-shopify-state.ts
 */

import { PrismaClient } from "@prisma/client";
import { compareSizes } from "../app/lib/size-order";

const prisma = new PrismaClient();
const API_VERSION = "2025-10";

let discrepancyCount = 0;

function logDiscrepancy(message: string) {
  discrepancyCount++;
  console.log(`  ⚠ DISCREPANCY: ${message}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GraphqlFn = (query: string, variables?: Record<string, unknown>) => Promise<{ data: any; errors?: any[] }>;

async function getShopifyClient(): Promise<{ graphql: GraphqlFn; shop: string }> {
  const sessions = await prisma.session.findMany();
  const session = sessions.find((s) => s.accessToken && s.accessToken.length > 0)!;
  if (!session) {
    throw new Error(
      `No session with access token found (${sessions.length} session(s) total) — open the app in Shopify Admin first`
    );
  }

  async function graphql(query: string, variables?: Record<string, unknown>) {
    const response = await fetch(
      `https://${session.shop}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      }
    );
    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  return { graphql, shop: session.shop };
}

async function shopifyProductExists(graphql: GraphqlFn, shopifyProductId: string): Promise<boolean> {
  try {
    const { data } = await graphql(
      `query product($id: ID!) { product(id: $id) { id } }`,
      { id: shopifyProductId }
    );
    return !!data.product;
  } catch {
    return false;
  }
}

async function shopifyVariantState(graphql: GraphqlFn, shopifyVariantId: string) {
  try {
    const { data } = await graphql(
      `query variant($id: ID!) {
        productVariant(id: $id) {
          id
          price
        }
      }`,
      { id: shopifyVariantId }
    );
    return data.productVariant;
  } catch {
    return null;
  }
}

async function getPrimaryLocationId(graphql: GraphqlFn): Promise<string> {
  const { data } = await graphql(`{ locations(first: 1) { nodes { id } } }`);
  return data.locations.nodes[0].id;
}

async function syncVariantInventoryAndPrice(
  graphql: GraphqlFn,
  variant: { id: string; shopifyVariantId: string | null; inventoryItemId: string | null; productId: string },
  locationId: string
) {
  if (!variant.inventoryItemId || !variant.shopifyVariantId) return;

  const product = await prisma.product.findUniqueOrThrow({
    where: { id: variant.productId },
  });
  if (!product.shopifyProductId) return;

  // Find lowest active price for this variant
  const lowestListing = await prisma.listing.findFirst({
    where: { variantId: variant.id, status: "active" },
    orderBy: { price: "asc" },
    select: { price: true },
  });

  let totalQuantity = 0;
  if (lowestListing) {
    totalQuantity = await prisma.listing.count({
      where: { variantId: variant.id, status: "active", price: lowestListing.price },
    });
  }

  // Check current Shopify state for discrepancy logging
  const shopifyState = await shopifyVariantState(graphql, variant.shopifyVariantId);
  if (shopifyState) {
    const shopifyPrice = parseFloat(shopifyState.price);
    const expectedPrice = lowestListing?.price ?? 0;
    if (shopifyPrice !== expectedPrice) {
      logDiscrepancy(
        `Variant sz price: Shopify=$${shopifyPrice}, DB expects=$${expectedPrice} — fixing`
      );
    }
  }

  // Set inventory
  await graphql(
    `mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        userErrors { field message }
      }
    }`,
    {
      input: {
        name: "available",
        reason: "correction",
        ignoreCompareQuantity: true,
        quantities: [{
          inventoryItemId: variant.inventoryItemId,
          locationId,
          quantity: totalQuantity,
        }],
      },
    }
  );

  // Set price
  await graphql(
    `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }`,
    {
      productId: product.shopifyProductId,
      variants: [{
        id: variant.shopifyVariantId,
        price: lowestListing ? String(lowestListing.price) : "0",
      }],
    }
  );
}

async function main() {
  console.log("\n=== REBUILD SHOPIFY STATE ===\n");

  const { graphql, shop } = await getShopifyClient();
  console.log(`Using shop: ${shop}\n`);

  // Step 1: Verify all products with Shopify IDs still exist
  console.log("Step 1: Verifying products in Shopify...");
  const products = await prisma.product.findMany({
    where: { shopifyProductId: { not: null } },
    include: { variants: true },
  });

  for (const product of products) {
    const exists = await shopifyProductExists(graphql, product.shopifyProductId!);
    if (!exists) {
      logDiscrepancy(
        `Product "${product.title}" (${product.shopifyProductId}) missing from Shopify — clearing ID`
      );
      await prisma.product.update({
        where: { id: product.id },
        data: { shopifyProductId: null },
      });
      // Clear variant IDs too since they belonged to this product
      for (const v of product.variants) {
        if (v.shopifyVariantId) {
          await prisma.variant.update({
            where: { id: v.id },
            data: { shopifyVariantId: null, inventoryItemId: null },
          });
        }
      }
    } else {
      console.log(`  ✓ ${product.title} exists`);
    }
  }

  // Step 2: Verify all variants with Shopify IDs still exist
  console.log("\nStep 2: Verifying variants in Shopify...");
  const variants = await prisma.variant.findMany({
    where: { shopifyVariantId: { not: null } },
    include: { product: true },
  });

  for (const variant of variants) {
    const state = await shopifyVariantState(graphql, variant.shopifyVariantId!);
    if (!state) {
      logDiscrepancy(
        `Variant "${variant.product.title} sz ${variant.size}" (${variant.shopifyVariantId}) missing from Shopify — clearing ID`
      );
      await prisma.variant.update({
        where: { id: variant.id },
        data: { shopifyVariantId: null, inventoryItemId: null },
      });
    } else {
      console.log(`  ✓ ${variant.product.title} sz ${variant.size} exists`);
    }
  }

  // Step 3: Recreate missing Shopify products/variants for active listings
  console.log("\nStep 3: Recreating missing products/variants...");
  const variantsWithListings = await prisma.variant.findMany({
    where: {
      listings: { some: { status: "active" } },
      shopifyVariantId: null,
    },
    include: { product: true },
  });

  if (variantsWithListings.length === 0) {
    console.log("  No missing variants to recreate");
  }

  // Sort by product then by size so Shopify variants appear in logical order
  variantsWithListings.sort((a, b) =>
    a.productId.localeCompare(b.productId) || compareSizes(a.size, b.size)
  );

  for (const variant of variantsWithListings) {
    // Re-read product from DB — it may have been updated by a previous iteration
    const product = await prisma.product.findUniqueOrThrow({ where: { id: variant.productId } });

    if (!product.shopifyProductId) {
      // Create product + first variant
      console.log(`  Creating Shopify product: ${product.title}...`);
      const { data } = await graphql(
        `mutation productCreate($product: ProductCreateInput!) {
          productCreate(product: $product) {
            product {
              id
              variants(first: 1) {
                nodes { id inventoryItem { id } }
              }
            }
            userErrors { field message }
          }
        }`,
        {
          product: {
            title: product.title,
            status: "ACTIVE",
            productOptions: [
              { name: "Size", values: [{ name: variant.size }] },
            ],
          },
        }
      );

      const { product: shopifyProduct, userErrors } = data.productCreate;
      if (userErrors.length > 0) {
        console.error(`  ✗ Failed to create "${product.title}": ${userErrors[0].message}`);
        continue;
      }

      const shopifyVariant = shopifyProduct.variants.nodes[0];

      // Publish to all sales channels
      const { data: pubData } = await graphql(`{ publications(first: 10) { nodes { id } } }`);
      const publicationIds = pubData.publications.nodes.map((p: { id: string }) => p.id);
      await graphql(
        `mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            userErrors { field message }
          }
        }`,
        {
          id: shopifyProduct.id,
          input: publicationIds.map((publicationId: string) => ({ publicationId })),
        }
      );

      // Mark inventory as tracked
      await graphql(
        `mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
          inventoryItemUpdate(id: $id, input: $input) {
            userErrors { field message }
          }
        }`,
        { id: shopifyVariant.inventoryItem.id, input: { tracked: true } }
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
      ]);

      logDiscrepancy(
        `Product "${product.title}" recreated as ${shopifyProduct.id}`
      );
      await sleep(500); // Rate limit protection
    } else {
      // Product exists, add variant
      console.log(`  Adding variant: ${product.title} sz ${variant.size}...`);
      const { data } = await graphql(
        `mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkCreate(productId: $productId, variants: $variants) {
            productVariants { id inventoryItem { id } }
            userErrors { field message }
          }
        }`,
        {
          productId: product.shopifyProductId,
          variants: [{ optionValues: [{ name: variant.size, optionName: "Size" }] }],
        }
      );

      const { productVariants, userErrors } = data.productVariantsBulkCreate;
      if (userErrors.length > 0) {
        console.error(`  ✗ Failed: ${userErrors[0].message}`);
        continue;
      }

      const shopifyVariant = productVariants[0];

      // Mark inventory as tracked
      await graphql(
        `mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
          inventoryItemUpdate(id: $id, input: $input) {
            userErrors { field message }
          }
        }`,
        { id: shopifyVariant.inventoryItem.id, input: { tracked: true } }
      );

      await prisma.variant.update({
        where: { id: variant.id },
        data: {
          shopifyVariantId: shopifyVariant.id,
          inventoryItemId: shopifyVariant.inventoryItem.id,
        },
      });

      logDiscrepancy(
        `Variant "${product.title} sz ${variant.size}" recreated as ${shopifyVariant.id}`
      );
      await sleep(300); // Rate limit protection
    }
  }

  // Step 4: Sync inventory + prices for all variants with Shopify IDs
  console.log("\nStep 4: Syncing inventory and prices...");
  const locationId = await getPrimaryLocationId(graphql);

  const allVariants = await prisma.variant.findMany({
    where: { shopifyVariantId: { not: null } },
    include: { product: true },
  });

  for (const variant of allVariants) {
    await syncVariantInventoryAndPrice(graphql, variant, locationId);
    console.log(`  ✓ ${variant.product.title} sz ${variant.size} — inventory + price synced`);
  }

  // Summary
  console.log("\n=== REBUILD COMPLETE ===");
  if (discrepancyCount === 0) {
    console.log("No discrepancies found — Shopify state matches DB perfectly.\n");
  } else {
    console.log(`${discrepancyCount} discrepancy(ies) found and fixed.\n`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
