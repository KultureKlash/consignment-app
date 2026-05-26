// Read-only check: connect to Neon prod and verify a Shopify offline session
// exists. Prints shop domain + access-token prefix so we can confirm without
// leaking the full token.
require("dotenv").config();

// Override DATABASE_URL with the Neon URL from .env (which is commented out).
const fs = require("fs");
const envText = fs.readFileSync(".env", "utf8");
const neonMatch = envText.match(/^#\s*DATABASE_URL="?(postgresql:\/\/[^"]+neon\.tech[^"]*)"?/m);
if (!neonMatch) {
  console.error("Could not find commented Neon DATABASE_URL in .env");
  process.exit(1);
}
process.env.DATABASE_URL = neonMatch[1];

(async () => {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const sessions = await prisma.session.findMany({
      select: { id: true, shop: true, isOnline: true, expires: true, accessToken: true, scope: true },
    });
    console.log(`Found ${sessions.length} session(s) in Neon:`);
    for (const s of sessions) {
      const tokenPrefix = s.accessToken ? s.accessToken.slice(0, 8) + "..." : "(none)";
      const offline = s.expires === null ? "OFFLINE" : `expires ${s.expires.toISOString()}`;
      console.log(`  ${s.shop} | ${offline} | online=${s.isOnline} | token=${tokenPrefix} | scope=${s.scope?.slice(0, 60)}...`);
    }

    const counts = {
      consignors: await prisma.consignor.count(),
      products: await prisma.product.count(),
      variants: await prisma.variant.count(),
      listings: await prisma.listing.count(),
      orders: await prisma.order.count(),
      payouts: await prisma.payout.count(),
      transactions: await prisma.transaction.count(),
    };
    console.log("\nCurrent Neon table counts:");
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  } finally {
    await prisma.$disconnect();
  }
})();
