import prisma from "~/db.server";
import { TRANSACTION_TYPE, ORDER_ITEM_STATUS } from "~/lib/order-statuses";

export async function getConsignorPayouts(consignorId: string, opts: { storeOwned?: boolean } = {}) {
  const storeOwned = opts.storeOwned ?? false;
  if (storeOwned) {
    return { payouts: [], unbatchedTxs: [], storeOwned: true };
  }

  const payouts = await prisma.payout.findMany({
    where: { consignorId },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          transaction: {
            include: {
              orderItem: {
                include: {
                  order: true,
                  listing: {
                    include: { variant: { include: { product: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Unbatched sale transactions (not in any payout yet)
  const unbatchedTxs = await prisma.transaction.findMany({
    where: { consignorId, type: TRANSACTION_TYPE.SALE, payoutItems: { none: {} }, orderItem: { status: ORDER_ITEM_STATUS.SOLD } },
    orderBy: { createdAt: "desc" },
    include: {
      orderItem: {
        include: {
          order: true,
          listing: {
            include: { variant: { include: { product: true } } },
          },
        },
      },
    },
  });

  return { payouts, unbatchedTxs };
}
