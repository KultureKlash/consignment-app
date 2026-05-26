// Audit Shopify product state vs. expected from migration.
const fs = require("fs");
const path = require("path");

const envText = fs.readFileSync(".env", "utf8");
const neonMatch = envText.match(/^#\s*DATABASE_URL="?(postgresql:\/\/[^"]+neon\.tech[^"]*)"?/m);
process.env.DATABASE_URL = neonMatch[1];

const SHOPIFY_API_VERSION = "2024-10";

(async () => {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const session = await prisma.session.findFirst({ where: { accessToken: { not: "" } } });
    const endpoint = `https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

    // Fetch all products with first variant tracked status
    let cursor = null;
    let hasNext = true;
    const allProducts = [];

    while (hasNext) {
      const after = cursor ? `, after: "${cursor}"` : "";
      const query = `query {
        products(first: 100${after}) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id title vendor
            variants(first: 50) {
              nodes {
                id title
                price
                inventoryItem { id tracked }
                inventoryQuantity
              }
            }
          }
        }
      }`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": session.accessToken },
        body: JSON.stringify({ query }),
      });
      const body = await res.json();
      if (body.errors) { console.error(body.errors); process.exit(1); }
      for (const p of body.data.products.nodes) allProducts.push(p);
      hasNext = body.data.products.pageInfo.hasNextPage;
      cursor = body.data.products.pageInfo.endCursor;
      process.stdout.write(`\r  fetched ${allProducts.length} products`);
    }
    process.stdout.write("\n");

    // Categorize
    let untrackedAny = 0;
    let untrackedAll = 0;
    let zeroStockAll = 0;
    let healthy = 0;
    const untrackedSamples = [];

    for (const p of allProducts) {
      const variantsTracked = p.variants.nodes.map((v) => v.inventoryItem.tracked);
      const allTracked = variantsTracked.every((t) => t);
      const noneTracked = variantsTracked.every((t) => !t);
      const someUntracked = variantsTracked.some((t) => !t);
      const totalQty = p.variants.nodes.reduce((s, v) => s + (v.inventoryQuantity ?? 0), 0);

      if (noneTracked) {
        untrackedAll++;
        if (untrackedSamples.length < 10) untrackedSamples.push({ id: p.id, title: p.title, vendor: p.vendor, variants: p.variants.nodes.length });
      } else if (someUntracked) {
        untrackedAny++;
      } else if (allTracked && totalQty === 0) {
        zeroStockAll++;
      } else {
        healthy++;
      }
    }

    console.log(`\nTotal Shopify products: ${allProducts.length}`);
    console.log(`  Healthy (tracked + has stock): ${healthy}`);
    console.log(`  Tracked but 0 stock (no listings): ${zeroStockAll}`);
    console.log(`  Partial tracking (some variants untracked): ${untrackedAny}`);
    console.log(`  No tracking on any variant: ${untrackedAll}`);

    if (untrackedSamples.length > 0) {
      console.log(`\nSample untracked products:`);
      for (const s of untrackedSamples) console.log(`  ${s.title} (${s.vendor}) — ${s.variants} variants — ${s.id}`);
    }

    // Cross-reference with Neon
    const neonProductCount = await prisma.product.count();
    console.log(`\nNeon products: ${neonProductCount}`);
    const neonWithShopifyId = await prisma.product.count({ where: { shopifyProductId: { not: null } } });
    console.log(`Neon products with Shopify ID: ${neonWithShopifyId}`);

    // Check if untracked products exist in Neon
    if (untrackedSamples.length > 0) {
      console.log(`\nChecking if untracked products exist in Neon:`);
      for (const s of untrackedSamples.slice(0, 5)) {
        const inNeon = await prisma.product.findFirst({ where: { shopifyProductId: s.id } });
        console.log(`  ${s.title} — ${inNeon ? `IN NEON (id=${inNeon.id})` : "NOT IN NEON (orphan)"}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
})();
