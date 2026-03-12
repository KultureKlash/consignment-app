import { PrismaClient } from "@prisma/client";
import { beforeEach, afterAll } from "vitest";

export const prisma = new PrismaClient();

// Before each test, clean all marketplace data (order matters for FK constraints)
beforeEach(async () => {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.variant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.consignor.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Helper to create a test consignor
export async function createTestConsignor(overrides: { name?: string; email?: string; commissionRate?: number } = {}) {
  return prisma.consignor.create({
    data: {
      name: overrides.name ?? "Test Consignor",
      email: overrides.email ?? `test-${Date.now()}@example.com`,
      commissionRate: overrides.commissionRate ?? 0.85,
    },
  });
}
