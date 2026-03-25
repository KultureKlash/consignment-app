import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Test 1: Check consignor exists
  const consignor = await prisma.consignor.findUnique({
    where: { email: "alice@test.com" },
  });
  console.log("Consignor lookup:", consignor ? `Found: ${consignor.name} (${consignor.id})` : "NOT FOUND");

  // Test 2: Simulate loginPortal logic
  const email = "alice@test.com";
  const password = "konsign";

  if (password !== "konsign") {
    console.log("Password check: FAILED");
    return;
  }
  console.log("Password check: PASSED");

  const found = await prisma.consignor.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!found) {
    console.log("DB lookup: NOT FOUND");
    return;
  }
  console.log("DB lookup: FOUND", found.name, found.id);

  // Test 3: Cookie string
  const cookie = `__portal_session=${found.id}; Path=/portal; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
  console.log("Cookie:", cookie);

  // Test 4: Parse cookie back
  const match = cookie.match(/__portal_session=([^;]+)/);
  console.log("Cookie parse:", match ? match[1] : "FAILED");

  // Test 5: Lookup by ID
  const byId = await prisma.consignor.findUnique({ where: { id: match![1] } });
  console.log("Auth check:", byId ? `OK: ${byId.name}` : "FAILED");
}

main().catch(console.error).finally(() => prisma.$disconnect());
