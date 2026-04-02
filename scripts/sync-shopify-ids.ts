/**
 * Sync Shopify product/variant IDs to local database.
 * Matches by product title + variant size (Option1 value).
 *
 * Run: npx tsx scripts/sync-shopify-ids.ts
 * Prerequisite: Open the app in Shopify Admin first to create a session.
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
  console.log(`Using shop: ${session.shop}`);

  async function graphql(query: string, variables?: Record<string, unknown>) {
    const response = await fetch(
      `https://${session.shop}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session!.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      },
    );
    if (!response.ok) throw new Error(`Shopify API error: ${response.status}`);
    const json = await response.json();
    if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    return json.data;
  }

  return { graphql };
}

const PRODUCTS_QUERY = `
  query ($cursor: String) {
    products(first: 50, after: $cursor, sortKey: TITLE) {
      edges {
        node {
          id
          title
          variants(first: 100) {
            edges {
              node {
                id
                title
                selectedOptions {
                  name
                  value
                }
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

async function main() {
  const { graphql } = await getShopifyClient();

  // Build a map of local products by title
  const localProducts = await prisma.product.findMany({
    select: { id: true, title: true, shopifyProductId: true },
  });
  const productByTitle = new Map<string, string>();
  let alreadyLinkedProducts = 0;
  for (const p of localProducts) {
    if (p.shopifyProductId) alreadyLinkedProducts++;
    productByTitle.set(p.title.toLowerCase().trim(), p.id);
  }
  console.log(`Local products: ${localProducts.length} (${alreadyLinkedProducts} already linked)`);

  // Build a map of local variants by productId + size
  const localVariants = await prisma.variant.findMany({
    select: { id: true, productId: true, size: true, shopifyVariantId: true },
  });
  const variantByKey = new Map<string, string>();
  let alreadyLinkedVariants = 0;
  for (const v of localVariants) {
    if (v.shopifyVariantId) alreadyLinkedVariants++;
    variantByKey.set(`${v.productId}|${v.size.toLowerCase().trim()}`, v.id);
  }
  console.log(`Local variants: ${localVariants.length} (${alreadyLinkedVariants} already linked)`);

  // Fetch all Shopify products and match
  let cursor: string | null = null;
  let shopifyProductCount = 0;
  let matchedProducts = 0;
  let matchedVariants = 0;
  let unmatchedProducts = 0;

  console.log("\nFetching Shopify products...");

  while (true) {
    const data = await graphql(PRODUCTS_QUERY, { cursor });
    const edges = data.products.edges;

    for (const { node: shopifyProduct } of edges) {
      shopifyProductCount++;
      const title = shopifyProduct.title.toLowerCase().trim();
      const localProductId = productByTitle.get(title);

      if (!localProductId) {
        unmatchedProducts++;
        continue;
      }

      // Update product with Shopify ID
      try {
        await prisma.product.update({
          where: { id: localProductId },
          data: { shopifyProductId: shopifyProduct.id },
        });
        matchedProducts++;
      } catch {
        // Already linked (unique constraint) — skip
      }

      // Match variants by size
      for (const { node: shopifyVariant } of shopifyProduct.variants.edges) {
        const sizeOption = shopifyVariant.selectedOptions?.find(
          (o: { name: string; value: string }) => o.name === "Size",
        );
        const size = (sizeOption?.value ?? shopifyVariant.title ?? "").toLowerCase().trim();
        const variantKey = `${localProductId}|${size}`;
        const localVariantId = variantByKey.get(variantKey);

        if (!localVariantId) continue;

        try {
          await prisma.variant.update({
            where: { id: localVariantId },
            data: {
              shopifyVariantId: shopifyVariant.id,
              inventoryItemId: shopifyVariant.inventoryItem?.id ?? null,
            },
          });
          matchedVariants++;
        } catch {
          // Already linked — skip
        }
      }
    }

    // Progress
    process.stdout.write(`\r  Processed ${shopifyProductCount} Shopify products...`);

    const { hasNextPage, endCursor } = data.products.pageInfo;
    if (!hasNextPage) break;
    cursor = endCursor;

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n\nDone!`);
  console.log(`  Shopify products fetched: ${shopifyProductCount}`);
  console.log(`  Products matched: ${matchedProducts}`);
  console.log(`  Variants matched: ${matchedVariants}`);
  console.log(`  Unmatched Shopify products: ${unmatchedProducts}`);

  // Summary of unlinked
  const stillUnlinkedProducts = await prisma.product.count({ where: { shopifyProductId: null } });
  const stillUnlinkedVariants = await prisma.variant.count({ where: { shopifyVariantId: null } });
  console.log(`\n  Still unlinked: ${stillUnlinkedProducts} products, ${stillUnlinkedVariants} variants`);
}

main()
  .catch((e) => { console.error("Sync failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
