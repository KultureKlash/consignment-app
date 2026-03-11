/**
 * Dev utility: clears all Shopify sessions, forcing re-auth on next request.
 * Run with: npx tsx prisma/reset-sessions.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.session.deleteMany();
  console.log(`Deleted ${result.count} session(s). Refresh the app to re-authenticate.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
