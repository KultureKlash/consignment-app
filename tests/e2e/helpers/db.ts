import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Count active listings, optionally filtered by variantId */
export async function countActiveListings(variantId?: string) {
  return prisma.listing.count({
    where: {
      status: "active",
      ...(variantId ? { variantId } : {}),
    },
  });
}

/** Get all listings ordered by price, createdAt */
export async function getAllListings() {
  return prisma.listing.findMany({
    include: {
      consignor: true,
      variant: { include: { product: true } },
    },
    orderBy: [{ price: "asc" }, { createdAt: "asc" }],
  });
}

/** Get the most recent order with items and transactions */
export async function getLatestOrder() {
  return prisma.order.findFirst({
    include: {
      items: {
        include: {
          listing: { include: { consignor: true } },
          transactions: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Get all orders */
export async function getAllOrders() {
  return prisma.order.findMany({
    include: {
      items: {
        include: {
          listing: { include: { consignor: true } },
          transactions: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Get consignor balance (sum of all transaction amounts) */
export async function getConsignorBalance(consignorId: string) {
  const result = await prisma.transaction.aggregate({
    where: { consignorId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

/** Get all consignors */
export async function getConsignors() {
  return prisma.consignor.findMany({ orderBy: { name: "asc" } });
}

/**
 * Poll the DB until a condition is met (useful for waiting on webhooks).
 * Returns the result of the check function when it returns a truthy value.
 */
export async function waitFor<T>(
  check: () => Promise<T | null | undefined | false>,
  { timeout = 15_000, interval = 500 } = {}
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await check();
    if (result) return result;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`waitFor timed out after ${timeout}ms`);
}

/** Disconnect Prisma (call in globalTeardown) */
export async function disconnect() {
  await prisma.$disconnect();
}
