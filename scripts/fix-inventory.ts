/**
 * Fix existing products that show "0 in stock" on Shopify.
 * For each variant with a Shopify inventory item:
 *   1. Activate inventory at the primary location
 *   2. Set correct quantity based on active listings
 *   3. Sync price to lowest active ask
 *   4. Fix SKU on the inventory item
 *
 * Run: npx tsx scripts/fix-inventory.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const API_VERSION = "2025-10";

async function getShopifyClient() {
  const sessions = await prisma.session.findMany();
  const session = sessions.find((s) => s.accessToken && s.accessToken.length > 0);
  if (!session) {
    throw new Error("No session with access token found — open the app in Shopify Admin first");
  }
  console.log(`Using shop: ${session.shop}\n`);

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

  return graphql;
}

async function main() {
  console.log("\n=== FIX INVENTORY ===\n");

  const graphql = await getShopifyClient();

  // Get primary location
  const locData = await graphql(`{ locations(first: 1) { nodes { id } } }`);
  const locationId = locData.data.locations.nodes[0].id;
  console.log(`Primary location: ${locationId}\n`);

  // Find all variants that are synced to Shopify
  const variants = await prisma.variant.findMany({
    where: {
      inventoryItemId: { not: null },
      shopifyVariantId: { not: null },
    },
    include: {
      product: true,
    },
  });

  console.log(`Found ${variants.length} synced variant(s)\n`);

  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const variant of variants) {
    const label = `${variant.product.title} / ${variant.size}`;
    try {
      // 1. Activate inventory at primary location
      await graphql(
        `mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
          inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
            inventoryLevel { id }
            userErrors { field message }
          }
        }`,
        { inventoryItemId: variant.inventoryItemId, locationId }
      );

      // 2. Count active listings at lowest price
      const lowestListing = await prisma.listing.findFirst({
        where: { variantId: variant.id, status: "active" },
        orderBy: { price: "asc" },
        select: { price: true },
      });

      let quantity: number;
      if (!lowestListing) {
        quantity = 0;
      } else {
        quantity = await prisma.listing.count({
          where: { variantId: variant.id, status: "active", price: lowestListing.price },
        });
      }

      // 3. Set inventory quantity
      const invRes = await graphql(
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
              quantity,
            }],
          },
        }
      );
      const invErrors = invRes.data.inventorySetQuantities.userErrors;
      if (invErrors.length > 0) {
        console.error(`  ✗ ${label}: inventory error — ${invErrors[0].message}`);
        errors++;
        continue;
      }

      // 4. Sync price on Shopify variant
      if (variant.product.shopifyProductId) {
        await graphql(
          `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors { field message }
            }
          }`,
          {
            productId: variant.product.shopifyProductId,
            variants: [{
              id: variant.shopifyVariantId,
              price: lowestListing ? String(lowestListing.price) : "0",
            }],
          }
        );
      }

      // 5. Fix SKU on inventory item
      const isFootwear = !variant.product.category || variant.product.category.startsWith("Footwear");
      const sku = (isFootwear && variant.product.styleId)
        ? variant.product.styleId
        : (variant.gtin || "");

      if (sku) {
        await graphql(
          `mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
            inventoryItemUpdate(id: $id, input: $input) {
              userErrors { field message }
            }
          }`,
          { id: variant.inventoryItemId, input: { sku } }
        );
      }

      // 6. Fix barcode on variant
      if (variant.gtin && variant.product.shopifyProductId) {
        await graphql(
          `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors { field message }
            }
          }`,
          {
            productId: variant.product.shopifyProductId,
            variants: [{ id: variant.shopifyVariantId, barcode: variant.gtin }],
          }
        );
      }

      console.log(`  ✓ ${label}: qty=${quantity}, price=$${lowestListing?.price ?? 0}${sku ? `, sku=${sku}` : ""}`);
      fixed++;

      // Rate limit
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`  ✗ ${label}: ${err instanceof Error ? err.message : err}`);
      errors++;
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Fixed: ${fixed}, Skipped: ${skipped}, Errors: ${errors}\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
