// Pure Neon-side audit — no Shopify calls. Find products that should have
// listings but don't, and products without active listings (which would
// explain "0 in stock" in Shopify).
const fs = require("fs");

const envText = fs.readFileSync(".env", "utf8");
const neonMatch = envText.match(/^#\s*DATABASE_URL="?(postgresql:\/\/[^"]+neon\.tech[^"]*)"?/m);
process.env.DATABASE_URL = neonMatch[1];

(async () => {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const products = await prisma.product.findMany({
      where: { shopifyProductId: { not: null } },
      include: {
        variants: {
          select: {
            id: true, size: true, shopifyVariantId: true,
            _count: { select: { listings: { where: { status: "active" } } } },
          },
        },
      },
    });

    let prodsWithActive = 0;
    let prodsWithoutAnyActive = 0;
    let prodsPartial = 0; // some variants have listings, some don't

    const orphanProducts = []; // products with no active listings anywhere

    for (const p of products) {
      const variantsWithListings = p.variants.filter((v) => v._count.listings > 0);
      if (variantsWithListings.length === p.variants.length && variantsWithListings.length > 0) {
        prodsWithActive++;
      } else if (variantsWithListings.length === 0) {
        prodsWithoutAnyActive++;
        if (orphanProducts.length < 10) orphanProducts.push({ title: p.title, brand: p.brand, variants: p.variants.length });
      } else {
        prodsPartial++;
      }
    }

    console.log(`Neon products (with Shopify ID): ${products.length}`);
    console.log(`  All variants have active listings: ${prodsWithActive}`);
    console.log(`  Some variants have listings, others don't: ${prodsPartial}`);
    console.log(`  NO active listings at all: ${prodsWithoutAnyActive}`);

    if (orphanProducts.length > 0) {
      console.log(`\nSample products with NO active listings (would show "0 in stock" in Shopify):`);
      for (const p of orphanProducts) console.log(`  ${p.title} (${p.brand}) — ${p.variants} variants`);
    }

    // Specifically check for some titles the user mentioned
    const sampleTitles = ["Hellstar Warm Up", "Louis Vuitton Christopher", "Black Dior Gravity", "Chrome Hearts Long Sleeve"];
    console.log(`\nSpecific lookups:`);
    for (const t of sampleTitles) {
      const p = await prisma.product.findFirst({
        where: { title: { contains: t, mode: "insensitive" } },
        include: {
          variants: {
            select: { size: true, _count: { select: { listings: { where: { status: "active" } } } } },
          },
        },
      });
      if (!p) {
        console.log(`  "${t}" — NOT IN NEON`);
      } else {
        const totalActive = p.variants.reduce((s, v) => s + v._count.listings, 0);
        console.log(`  "${p.title}" — ${p.variants.length} variants, ${totalActive} active listings total`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
})();
