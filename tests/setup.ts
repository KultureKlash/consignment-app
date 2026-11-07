import { Prisma, PrismaClient } from "@prisma/client";
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

/**
 * Decimal -> number for assertions.
 *
 * Money columns are numeric(10,2), so Prisma hands back Prisma.Decimal.
 * `expect(decimal).toBe(30)` fails on Object.is even when the value is right,
 * and `toBe` takes `unknown` so TypeScript cannot warn about it.
 *
 * Preserves null and undefined rather than coercing them to 0 the way Number()
 * would, so an assertion can still tell "no price" from "zero price".
 */
export function money(value: Prisma.Decimal | number | null | undefined): number | null | undefined {
  if (value === null || value === undefined) return value;
  return Prisma.Decimal.isDecimal(value) ? value.toNumber() : value;
}
