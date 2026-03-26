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
    paused: 0,
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

/**
 * Suspend a consignor account. Blocks portal access and new submissions.
 * If pauseListings is true, all active listings are paused and Shopify inventory is synced to 0.
 */
export async function suspendConsignor(id: string, reason?: string, pauseListings = false) {
  const consignor = await prisma.consignor.findUnique({ where: { id } });
  if (!consignor) throw new Error("Consignor not found");
  if (consignor.status === "suspended") throw new Error("Consignor is already suspended");

  // Pause active listings if requested
  let pausedCount = 0;
  if (pauseListings) {
    const result = await prisma.listing.updateMany({
      where: { consignorId: id, status: "active" },
      data: { status: "paused" },
    });
    pausedCount = result.count;
  }

  const updated = await prisma.consignor.update({
    where: { id },
    data: {
      status: "suspended",
      suspensionReason: reason || null,
      suspendedAt: new Date(),
    },
  });

  return { consignor: updated, pausedCount };
}

/**
 * Get variant IDs that need Shopify inventory sync after a pause/unpause operation.
 */
export async function getConsignorVariantIds(consignorId: string, listingStatus: string) {
  const variants = await prisma.listing.findMany({
    where: { consignorId, status: listingStatus },
    select: { variantId: true },
    distinct: ["variantId"],
  });
  return variants.map((v) => v.variantId);
}

/**
 * Unsuspend (reactivate) a consignor account.
 * Automatically reactivates any paused listings and syncs inventory.
 */
export async function unsuspendConsignor(id: string) {
  const consignor = await prisma.consignor.findUnique({ where: { id } });
  if (!consignor) throw new Error("Consignor not found");
  if (consignor.status !== "suspended") throw new Error("Consignor is not suspended");

  // Reactivate paused listings
  const result = await prisma.listing.updateMany({
    where: { consignorId: id, status: "paused" },
    data: { status: "active" },
  });

  const updated = await prisma.consignor.update({
    where: { id },
    data: {
      status: "active",
      suspensionReason: null,
      suspendedAt: null,
    },
  });

  return { consignor: updated, reactivatedCount: result.count };
}
