import { PrismaClient } from "@prisma/client";
import { beforeEach, afterAll } from "vitest";

export const prisma = new PrismaClient();

// Before each test, clean all marketplace data (order matters for FK constraints)
beforeEach(async () => {
  await prisma.feedback.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.reassignmentLog.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.payoutItem.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.variant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.consignor.deleteMany();
  await prisma.storeSection.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Helper to create a test consignor
export async function createTestConsignor(overrides: { name?: string; email?: string; feeRate?: number; taxStatus?: string; status?: string; storeOwned?: boolean } = {}) {
  return prisma.consignor.create({
    data: {
      name: overrides.name ?? "Test Consignor",
      email: overrides.email ?? `test-${Date.now()}@example.com`,
      feeRate: overrides.feeRate ?? 0.15,
      taxStatus: overrides.taxStatus ?? "individual",
      status: overrides.status ?? "active",
      storeOwned: overrides.storeOwned ?? false,
    },
  });
}
