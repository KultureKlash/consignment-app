import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const shopConsignors = await prisma.consignor.findMany({
    where: { feeRate: 1.0 },
  });

  console.log("\n=== Shop Consignors ===");
  for (const c of shopConsignors) {
    console.log(`  ${c.name} (${c.email}) — feeRate: ${c.feeRate}`);
  }

  console.log(`\nTotal: ${shopConsignors.length} shop consignors`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
