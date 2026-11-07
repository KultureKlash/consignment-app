import { Prisma } from "@prisma/client";
import prisma from "~/db.server";
import { ORDER_STATUS } from "~/lib/order-statuses";
import { PAYOUT_STATUS } from "~/lib/payout-statuses";
import { ZERO } from "~/lib/finance";

/**
 * Get a consignor's current balance.
 * Balance = sum of all transactions (sales are positive, refunds are negative)
 *           minus sum of completed payouts.
 */
export async function getConsignorBalance(consignorId: string): Promise<Prisma.Decimal> {
  const [txAgg, payoutAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { consignorId },
      _sum: { amount: true },
    }),
    prisma.payout.aggregate({
      where: { consignorId, status: PAYOUT_STATUS.PAID },
      _sum: { amount: true },
    }),
  ]);

  const totalEarnings = txAgg._sum.amount ?? ZERO;
  const totalPayouts = payoutAgg._sum.amount ?? ZERO;

  return totalEarnings.minus(totalPayouts);
}

/** The subset of a Prisma client findOverpaidConsignors needs. */
type BalanceReader = {
  consignor: { findMany: typeof prisma.consignor.findMany };
  transaction: { aggregate: typeof prisma.transaction.aggregate };
  payout: { aggregate: typeof prisma.payout.aggregate };
};

export type OverpaidConsignor = {
  consignorId: string;
  name: string;
  email: string;
  /** sum(transactions.amount) — sales positive, refunds negative */
  net: Prisma.Decimal;
  /** sum(payouts.amount) where status = paid */
  paid: Prisma.Decimal;
  /** paid − net, always > tolerance for a returned row */
  overage: Prisma.Decimal;
};

/**
 * Consignors who have been paid more than they earned — a money-losing state
 * that should never exist.
 *
 * Compares the two populations whole, per consignor: every transaction against
 * every completed payout. Scoping one side to a subset (one import batch, one
 * simulation run) while leaving the other unscoped produces false positives,
 * because a payout can settle transactions created before that subset.
 *
 * Money columns are numeric(10,2) and SUM over them is exact, so the tolerance
 * exists only to absorb a legitimately tiny overage rather than float noise. It
 * is a Decimal comparison, never a JS number one.
 */
export async function findOverpaidConsignors(
  opts: { client?: BalanceReader; tolerance?: Prisma.Decimal | number | string } = {},
): Promise<OverpaidConsignor[]> {
  // One-off scripts build their own PrismaClient against a different
  // DATABASE_URL than ~/db.server picked up at import time, so they must be able
  // to pass theirs in rather than silently reconciling the wrong database.
  const db = opts.client ?? prisma;
  const tolerance = new Prisma.Decimal(opts.tolerance ?? "0.02");

  const consignors = await db.consignor.findMany({
    select: { id: true, name: true, email: true },
  });

  const overpaid: OverpaidConsignor[] = [];

  for (const c of consignors) {
    const [txAgg, payoutAgg] = await Promise.all([
      db.transaction.aggregate({
        where: { consignorId: c.id },
        _sum: { amount: true },
      }),
      db.payout.aggregate({
        where: { consignorId: c.id, status: PAYOUT_STATUS.PAID },
        _sum: { amount: true },
      }),
    ]);

    const net = txAgg._sum.amount ?? ZERO;
    const paid = payoutAgg._sum.amount ?? ZERO;
    const overage = paid.minus(net);

    if (overage.greaterThan(tolerance)) {
      overpaid.push({ consignorId: c.id, name: c.name, email: c.email, net, paid, overage });
    }
  }

  return overpaid.sort((a, b) => b.overage.comparedTo(a.overage));
}

/**
 * Get total amount already paid out to a consignor.
 */
export async function getConsignorPaidTotal(consignorId: string): Promise<Prisma.Decimal> {
  const result = await prisma.payout.aggregate({
    where: { consignorId, status: PAYOUT_STATUS.PAID },
    _sum: { amount: true },
  });
  return result._sum.amount ?? ZERO;
}

// ── Fulfill order (Shopify fulfilled webhook) ──

export async function fulfillOrder({ shopifyOrderId }: { shopifyOrderId: string }) {
  const order = await prisma.order.findUnique({ where: { shopifyId: shopifyOrderId } });
  if (!order) return;
  if (order.fulfilledAt) return; // idempotent

  await prisma.order.update({
    where: { id: order.id },
    data: { fulfilledAt: new Date(), status: ORDER_STATUS.FULFILLED },
  });
}
