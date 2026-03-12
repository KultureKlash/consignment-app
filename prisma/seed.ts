import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const consignor1 = await prisma.consignor.upsert({
    where: { email: "alice@test.com" },
    update: {},
    create: { name: "Alice Johnson", email: "alice@test.com", commissionRate: 0.85 },
  });

  const consignor2 = await prisma.consignor.upsert({
    where: { email: "bob@test.com" },
    update: {},
    create: { name: "Bob Smith", email: "bob@test.com", commissionRate: 0.80 },
  });

  console.log("Seeded consignors:");
  console.log(`  Alice: ${consignor1.id}`);
  console.log(`  Bob:   ${consignor2.id}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
