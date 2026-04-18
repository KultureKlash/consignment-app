import prisma from "~/db.server";
import { ORDER_STATUS } from "~/lib/order-statuses";
import { PAYOUT_STATUS } from "~/lib/payout-statuses";

/**
 * Get a consignor's current balance.
 * Balance = sum of all transactions (sales are positive, refunds are negative)
 *           minus sum of completed payouts.
 */
export async function getConsignorBalance(consignorId: string): Promise<number> {
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

  const totalEarnings = txAgg._sum.amount ?? 0;
  const totalPayouts = payoutAgg._sum.amount ?? 0;

  return totalEarnings - totalPayouts;
}

/**
 * Get total amount already paid out to a consignor.
 */
export async function getConsignorPaidTotal(consignorId: string): Promise<number> {
  const result = await prisma.payout.aggregate({
    where: { consignorId, status: PAYOUT_STATUS.PAID },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
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
