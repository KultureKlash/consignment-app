// Swap two consignors' emails to test addresses you control.
// Picks the 2 consignors with the MOST active listings (skipping Mery, store-owned, suspended).
// Run dry:  node scripts/swap-test-emails.cjs
// Execute:  node scripts/swap-test-emails.cjs --go
const fs = require("fs");

const envText = fs.readFileSync(".env", "utf8");
const neonMatch = envText.match(/^#\s*DATABASE_URL="?(postgresql:\/\/[^"]+neon\.tech[^"]*)"?/m);
process.env.DATABASE_URL = neonMatch[1];

const GO = process.argv.includes("--go");
const TARGET_EMAILS = ["info@shopkultureklash.com", "shopkultureklash@gmail.com"];

(async () => {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  try {
    // Find consignors ranked by active listing count (exclude Mery + store-owned + suspended)
    const all = await prisma.consignor.findMany({
      where: {
        email: { notIn: ["meryachkanou@gmail.com", ...TARGET_EMAILS] },
        storeOwned: false,
        status: "active",
      },
      select: {
        id: true, name: true, email: true,
        _count: { select: { listings: { where: { status: "active" } } } },
      },
    });
    all.sort((a, b) => b._count.listings - a._count.listings);

    const picks = all.slice(0, 2);
    console.log(`Top 2 consignors by active-listing count (excluding Mery, store-owned, suspended):\n`);
    picks.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.name} (${c.email}) — ${c._count.listings} active listings`);
      console.log(`     → will become: ${TARGET_EMAILS[i]}`);
    });

    if (!GO) {
      console.log(`\nDRY RUN — re-run with --go to apply.\n`);
      return;
    }

    // Check target emails aren't already in use (other than by these consignors)
    const conflicts = await prisma.consignor.findMany({
      where: { email: { in: TARGET_EMAILS }, id: { notIn: picks.map((p) => p.id) } },
    });
    if (conflicts.length > 0) {
      console.error(`\nConflict: emails already in use by other consignors:`);
      conflicts.forEach((c) => console.error(`  ${c.name} (${c.email}) [id=${c.id}]`));
      console.error(`Free them first, then re-run.`);
      process.exit(1);
    }

    for (let i = 0; i < picks.length; i++) {
      await prisma.consignor.update({
        where: { id: picks[i].id },
        data: { email: TARGET_EMAILS[i] },
      });
      console.log(`  ✓ ${picks[i].name}: ${picks[i].email} → ${TARGET_EMAILS[i]}`);
    }
    console.log(`\nDone. You can now OTP-login as either email.`);
  } finally {
    await prisma.$disconnect();
  }
})();
