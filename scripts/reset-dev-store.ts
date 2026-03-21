/**
 * Dev utility: nuclear reset of dev store.
 * Fetches ALL Shopify products (including orphans) → deletes them → wipes DB → seeds consignors.
 *
 * Run: npx tsx scripts/reset-dev-store.ts
 */

import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "production") {
  console.error("REFUSED: reset-dev-store.ts cannot run in production.");
  process.exit(1);
}

const prisma = new PrismaClient();
const API_VERSION = "2025-10";

async function getShopifyClient() {
  const sessions = await prisma.session.findMany();
  const session = sessions.find((s) => s.accessToken && s.accessToken.length > 0);
  if (!session) {
    console.log(`Found ${sessions.length} session(s), none with access tokens`);
    throw new Error(
      "No session with access token found — open the app in Shopify Admin first"
    );
  }
  console.log(`Using shop: ${session.shop}`);

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

async function fetchAllShopifyProductIds(
  graphql: Awaited<ReturnType<typeof getShopifyClient>>
): Promise<Array<{ id: string; title: string }>> {
  const products: Array<{ id: string; title: string }> = [];
  let cursor: string | null = null;
  let hasNext = true;

  while (hasNext) {
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const { data } = await graphql(`{
      products(first: 250${afterClause}) {
        nodes { id title }
        pageInfo { hasNextPage endCursor }
      }
    }`);

    const { nodes, pageInfo } = data.products;
    for (const node of nodes) {
      products.push(node);
      console.log(`  Found: ${node.title} (${node.id})`);
    }

    hasNext = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  return products;
}

async function main() {
  console.log("\n=== RESET DEV STORE ===\n");

  // Try to connect to Shopify and delete products
  let shopifyProductCount = 0;
  try {
    const graphql = await getShopifyClient();

    // Step 1: Fetch ALL Shopify products (don't trust DB — orphans may exist)
    console.log("Fetching all Shopify products...");
    const products = await fetchAllShopifyProductIds(graphql);
    console.log(`Found ${products.length} product(s) in Shopify\n`);

    // Step 2: Delete each product from Shopify
    if (products.length > 0) {
      console.log("Deleting Shopify products...");
      for (const product of products) {
        const { data } = await graphql(
          `mutation productDelete($input: ProductDeleteInput!) {
            productDelete(input: $input) {
              deletedProductId
              userErrors { field message }
            }
          }`,
          { input: { id: product.id } }
        );

        const { userErrors } = data.productDelete;
        if (userErrors.length > 0) {
          console.error(`  ✗ Failed to delete "${product.title}": ${userErrors[0].message}`);
        } else {
          console.log(`  ✓ Deleted "${product.title}"`);
        }
        // Small delay to avoid Shopify rate limits
        await new Promise((r) => setTimeout(r, 300));
      }
      console.log();
    }
    shopifyProductCount = products.length;
  } catch (err) {
    console.log(`Skipping Shopify cleanup: ${err instanceof Error ? err.message : err}`);
    console.log("(DB will still be wiped — delete Shopify products manually if needed)\n");
  }

  // Step 3: Wipe DB tables in FK order
  console.log("Wiping database...");
  const webhooks = await prisma.webhookEvent.deleteMany();
  const transactions = await prisma.transaction.deleteMany();
  const orderItems = await prisma.orderItem.deleteMany();
  const orders = await prisma.order.deleteMany();
  const listings = await prisma.listing.deleteMany();
  const variants = await prisma.variant.deleteMany();
  const dbProducts = await prisma.product.deleteMany();
  const payouts = await prisma.payout.deleteMany();

  console.log(
    `  Deleted: ${dbProducts.count} product(s), ${variants.count} variant(s), ${listings.count} listing(s)`
  );
  console.log(
    `  Deleted: ${orders.count} order(s), ${orderItems.count} item(s), ${transactions.count} transaction(s)`
  );
  console.log(
    `  Deleted: ${payouts.count} payout(s), ${webhooks.count} webhook event(s)`
  );

  // Step 4: Seed consignors (upsert — won't duplicate)
  console.log("\nSeeding consignors...");
  const alice = await prisma.consignor.upsert({
    where: { email: "alice@test.com" },
    update: {},
    create: { name: "Alice Johnson", email: "alice@test.com", feeRate: 0.15 },
  });
  const bob = await prisma.consignor.upsert({
    where: { email: "bob@test.com" },
    update: {},
    create: { name: "Bob Smith", email: "bob@test.com", feeRate: 0.20 },
  });
  console.log(`  Alice: ${alice.id} (15% fee)`);
  console.log(`  Bob:   ${bob.id} (20% fee)`);

  console.log("\n=== RESET COMPLETE ===");
  console.log(`Shopify: ${shopifyProductCount} product(s) deleted`);
  console.log("DB: all marketplace data wiped, consignors + sessions kept\n");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
