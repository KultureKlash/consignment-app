import prisma from "~/db.server";
import { toPlainMoney, roundMoney, ZERO } from "~/lib/finance";
import { PAYOUT_STATUS } from "~/lib/payout-statuses";
import { TRANSACTION_TYPE, ORDER_ITEM_STATUS } from "~/lib/order-statuses";

export async function getConsignorSales(
  consignorId: string,
  filters: { search?: string; status?: string } = {},
  opts: { storeOwned?: boolean } = {},
) {
  const storeOwned = opts.storeOwned ?? false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { consignorId, type: TRANSACTION_TYPE.SALE };

  // Status filter: "refunded" means the orderItem was refunded
  if (filters.status === ORDER_ITEM_STATUS.REFUNDED) {
    where.orderItem = { status: ORDER_ITEM_STATUS.REFUNDED };
  } else if (filters.status === ORDER_ITEM_STATUS.SOLD) {
    where.orderItem = { status: ORDER_ITEM_STATUS.SOLD };
  }

  // Search filter
  if (filters.search) {
    const s = filters.search;
    where.OR = [
      { orderItem: { order: { orderNumber: { contains: s } } } },
      { orderItem: { listing: { variant: { product: { title: { contains: s } } } } } },
    ];
  }

  const txInclude = {
    orderItem: {
      include: {
        order: true,
        listing: {
          include: { variant: { include: { product: true } } },
        },
      },
    },
    payoutItems: {
      include: { payout: { select: { id: true, status: true } } },
    },
  };

  const [transactions, totalEarned, salesCount] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: txInclude,
    }),
    prisma.transaction.aggregate({
      where: { consignorId, type: TRANSACTION_TYPE.SALE, orderItem: { status: ORDER_ITEM_STATUS.SOLD } },
      _sum: { consignorAmount: true, salePrice: true, cost: true },
    }),
    prisma.transaction.count({
      where: { consignorId, type: TRANSACTION_TYPE.SALE, orderItem: { status: ORDER_ITEM_STATUS.SOLD } },
    }),
  ]);

  const totalSalePrice = totalEarned._sum.salePrice ?? ZERO;
  const totalCost = totalEarned._sum.cost ?? ZERO;
  const totalEarnedVal = storeOwned
    ? totalSalePrice.minus(totalCost)
    : (totalEarned._sum.consignorAmount ?? ZERO);
  // Average is a derived display statistic, so rounding it to cents here is the
  // presentation choice, not a ledger value.
  const avgSale = salesCount > 0 ? roundMoney(totalSalePrice.dividedBy(salesCount)) : ZERO;

  const sales = transactions.map((tx) => {
    const payoutItem = tx.payoutItems[0];
    let payoutStatus: "unbatched" | "pending" | "paid" = "unbatched";
    if (payoutItem) {
      payoutStatus = payoutItem.payout.status === PAYOUT_STATUS.PAID ? "paid" : "pending";
    }

    return {
      id: tx.id,
      product: tx.orderItem?.listing.variant.product.title ?? "Unknown",
      size: tx.orderItem?.listing.variant.size ?? "",
      orderNumber: tx.orderItem?.order.orderNumber ?? "",
      salePrice: tx.salePrice,
      cost: tx.cost,
      fee: tx.feeAmount,
      payout: tx.consignorAmount,
      profit: tx.salePrice.minus(tx.cost),
      date: tx.createdAt,
      status: tx.orderItem?.status ?? ORDER_ITEM_STATUS.SOLD,
      payoutStatus,
    };
  });

  // Display boundary -- see app/lib/finance/serialize.ts.
  return toPlainMoney({
    storeOwned,
    sales,
    stats: {
      totalEarned: totalEarnedVal,
      itemsSold: salesCount,
      avgSale,
    },
  });
}
