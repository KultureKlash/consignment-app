/**
 * Sort variant display order on all Shopify products so sizes appear in logical order.
 * Handles numeric sizes (2, 5, 10, 11) and clothing sizes (XXXS → 5XL).
 *
 * Run: npx tsx scripts/sort-shopify-sizes.ts
 */

import { PrismaClient } from "@prisma/client";
import { compareSizes } from "../app/lib/size-order";

const prisma = new PrismaClient();
const API_VERSION = "2025-10";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GraphqlFn = (query: string, variables?: Record<string, unknown>) => Promise<{ data: any; errors?: any[] }>;

async function getShopifyClient(): Promise<GraphqlFn> {
  const sessions = await prisma.session.findMany();
  const session = sessions.find((s) => s.accessToken && s.accessToken.length > 0);
  if (!session) {
    throw new Error("No session with access token found — open the app in Shopify Admin first");
  }

  return async function graphql(query: string, variables?: Record<string, unknown>) {
    const response = await fetch(
      `https://${session.shop}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken!,
        },
        body: JSON.stringify({ query, variables }),
      }
    );
    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  };
}

async function main() {
  const graphql = await getShopifyClient();

  const products = await prisma.product.findMany({
    where: { shopifyProductId: { not: null } },
    select: { id: true, title: true, shopifyProductId: true },
  });

  console.log(`Found ${products.length} products with Shopify IDs\n`);

  let sorted = 0;
  let skipped = 0;
  let failed = 0;

  for (const product of products) {
    const shopifyId = product.shopifyProductId!;

    // Fetch variants with their size option value
    const { data } = await graphql(
      `query productVariants($id: ID!) {
        product(id: $id) {
          variants(first: 100) {
            nodes {
              id
              selectedOptions { name value }
            }
          }
        }
      }`,
      { id: shopifyId }
    );

    if (!data.product) {
      console.log(`  SKIP "${product.title}" — not found in Shopify`);
      skipped++;
      continue;
    }

    const variants = data.product.variants.nodes;
    if (variants.length < 2) {
      console.log(`  SKIP "${product.title}" — only ${variants.length} variant`);
      skipped++;
      continue;
    }

    // Extract size from each variant
    const withSize = variants.map((v: any) => ({
      id: v.id,
      size: v.selectedOptions.find((o: any) => o.name === "Size")?.value ?? "",
    }));

    const sortedVariants = [...withSize].sort((a: any, b: any) => compareSizes(a.size, b.size));

    // Check if already in order
    if (sortedVariants.every((v: any, i: number) => v.id === withSize[i].id)) {
      console.log(`  OK   "${product.title}" — already sorted [${withSize.map((v: any) => v.size).join(", ")}]`);
      skipped++;
      continue;
    }

    console.log(`  SORT "${product.title}" — [${withSize.map((v: any) => v.size).join(", ")}] → [${sortedVariants.map((v: any) => v.size).join(", ")}]`);

    try {
      const { data: reorderData, errors } = await graphql(
        `mutation productVariantsBulkReorder($productId: ID!, $positions: [ProductVariantPositionInput!]!) {
          productVariantsBulkReorder(productId: $productId, positions: $positions) {
            userErrors { field message }
          }
        }`,
        {
          productId: shopifyId,
          positions: sortedVariants.map((v: any, i: number) => ({ id: v.id, position: i + 1 })),
        }
      );

      if (errors?.length) {
        console.log(`  FAIL "${product.title}" — ${errors[0].message}`);
        failed++;
      } else {
        const userErrors = reorderData?.productVariantsBulkReorder?.userErrors;
        if (userErrors?.length > 0) {
          console.log(`  FAIL "${product.title}" — ${userErrors[0].message}`);
          failed++;
        } else {
          sorted++;
        }
      }
    } catch (err) {
      console.log(`  FAIL "${product.title}" — ${err instanceof Error ? err.message : err}`);
      failed++;
    }

    await sleep(250);
  }

  console.log(`\nDone: ${sorted} sorted, ${skipped} skipped, ${failed} failed`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
