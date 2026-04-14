import prisma from "~/db.server";

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
    where: { consignorId, type: "sale", payoutItems: { none: {} } },
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
