// Read-only Shopify API call to test if the token actually works,
// regardless of what the `expires` column says.
const fs = require("fs");
const path = require("path");

const envText = fs.readFileSync(".env", "utf8");
const neonMatch = envText.match(/^#\s*DATABASE_URL="?(postgresql:\/\/[^"]+neon\.tech[^"]*)"?/m);
if (!neonMatch) {
  console.error("Could not find Neon URL in .env");
  process.exit(1);
}
process.env.DATABASE_URL = neonMatch[1];

(async () => {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const session = await prisma.session.findFirst({ where: { accessToken: { not: "" } } });
    if (!session) {
      console.error("No session found");
      process.exit(1);
    }
    console.log(`Testing token for ${session.shop}...`);

    const res = await fetch(`https://${session.shop}/admin/api/2024-10/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({
        query: `query { shop { name } products(first: 1) { nodes { id } } }`,
      }),
    });

    console.log(`HTTP ${res.status}`);
    const body = await res.json();
    if (body.errors) {
      console.log("ERRORS:", JSON.stringify(body.errors, null, 2));
    } else {
      console.log("Shop name:", body.data?.shop?.name);
      console.log("Has any products:", (body.data?.products?.nodes?.length ?? 0) > 0);
    }
  } finally {
    await prisma.$disconnect();
  }
})();
