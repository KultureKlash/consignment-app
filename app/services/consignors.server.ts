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
 * Update consignor profile fields (name, email, feeRate).
 */
export async function updateConsignor(
  id: string,
  data: { name?: string; email?: string; feeRate?: number },
) {
  const consignor = await prisma.consignor.findUnique({ where: { id } });
  if (!consignor) throw new Error("Consignor not found");

  // Validate email uniqueness if changing
  if (data.email && data.email !== consignor.email) {
    const existing = await prisma.consignor.findUnique({ where: { email: data.email } });
    if (existing) throw new Error("Email already in use by another consignor");
  }

  // Validate fee rate (1–99%)
  if (data.feeRate !== undefined) {
    if (data.feeRate < 0.01 || data.feeRate > 0.99) {
      throw new Error("Fee rate must be between 1% and 99%");
    }
  }

  return prisma.consignor.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.feeRate !== undefined ? { feeRate: data.feeRate } : {}),
    },
  });
}
