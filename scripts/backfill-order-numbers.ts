/**
 * Backfill orderNumber for existing orders that have a shopifyId but no orderNumber.
 * Fetches order names from Shopify API.
 *
 * Run: npx tsx scripts/backfill-order-numbers.ts
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
  const orders = await prisma.order.findMany({
    where: {
      orderNumber: null,
      shopifyId: { not: null },
    },
  });

  if (orders.length === 0) {
    console.log("No orders to backfill.");
    return;
  }

  console.log(`Found ${orders.length} order(s) to backfill...`);
  const graphql = await getShopifyClient();

  for (const order of orders) {
    try {
      const result = await graphql(
        `query ($id: ID!) { order(id: $id) { name } }`,
        { id: order.shopifyId },
      );

      const name = result?.data?.order?.name;
      if (name) {
        await prisma.order.update({
          where: { id: order.id },
          data: { orderNumber: name },
        });
        console.log(`  ${order.shopifyId} → ${name}`);
      } else {
        console.log(`  ${order.shopifyId} — not found in Shopify (may be deleted)`);
      }
    } catch (err) {
      console.error(`  ${order.shopifyId} — error:`, err);
    }
  }

  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
