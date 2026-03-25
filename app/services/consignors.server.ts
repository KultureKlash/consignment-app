import prisma from "~/db.server";
import { getConsignorBalance } from "~/services/orders.server";

/**
 * Get full consignor detail: profile + balance + listing status counts.
 */
export async function getConsignorDetail(id: string) {
  const consignor = await prisma.consignor.findUnique({ where: { id } });
  if (!consignor) throw new Error("Consignor not found");

  const [balance, statusCounts] = await Promise.all([
    getConsignorBalance(id),
    prisma.listing.groupBy({
      by: ["status"],
      where: { consignorId: id },
      _count: { status: true },
    }),
  ]);

  const counts: Record<string, number> = {
    active: 0,
    pending_sale: 0,
    sold: 0,
    cancelled: 0,
  };
  for (const row of statusCounts) {
    counts[row.status] = row._count.status;
  }

  return { consignor, balance, counts };
}

/**
 * Create a new consignor with name, email, and fee rate.
 */
export async function createConsignor(data: { name: string; email: string; feeRate: number }) {
  const existing = await prisma.consignor.findUnique({ where: { email: data.email } });
  if (existing) throw new Error("A consignor with this email already exists");

  if (data.feeRate < 0 || data.feeRate > 1) {
    throw new Error("Fee rate must be between 0% and 100%");
  }

  return prisma.consignor.create({
    data: { name: data.name, email: data.email, feeRate: data.feeRate },
  });
}

/**
 * Update consignor profile fields (name, email, feeRate).
 */
export async function updateConsignor(
  id: string,
  data: { name?: string; email?: string; feeRate?: number; storeOwned?: boolean },
) {
  const consignor = await prisma.consignor.findUnique({ where: { id } });
  if (!consignor) throw new Error("Consignor not found");

  // Validate email uniqueness if changing
  if (data.email && data.email !== consignor.email) {
    const existing = await prisma.consignor.findUnique({ where: { email: data.email } });
    if (existing) throw new Error("Email already in use by another consignor");
  }

  // Validate fee rate (0–100%)
  if (data.feeRate !== undefined) {
    if (data.feeRate < 0 || data.feeRate > 1) {
      throw new Error("Fee rate must be between 0% and 100%");
    }
  }

  return prisma.consignor.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.feeRate !== undefined ? { feeRate: data.feeRate } : {}),
      ...(data.storeOwned !== undefined ? { storeOwned: data.storeOwned } : {}),
    },
  });
}
