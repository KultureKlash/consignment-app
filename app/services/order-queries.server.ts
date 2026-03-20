import prisma from "~/db.server";

export async function getOrderDetail(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          listing: {
            include: {
              consignor: true,
              variant: { include: { product: true } },
            },
          },
          transactions: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!order) throw new Error("Order not found");

  // Compute financial summary from transactions
  let totalFees = 0;
  let totalConsignorPayout = 0;
  const refundedCount = order.items.filter((i) => i.status === "refunded").length;

  for (const item of order.items) {
    for (const tx of item.transactions) {
      totalFees += tx.feeAmount;
      totalConsignorPayout += tx.consignorAmount;
    }
  }

  // Build timeline events
  type TimelineEvent = { label: string; date: string; type: "created" | "paid" | "refund" | "void" };
  const timeline: TimelineEvent[] = [];

  timeline.push({
    label: "Order created",
    date: order.createdAt.toISOString(),
    type: "created",
  });

  // Find first sale transaction = payment received
  const firstSale = order.items
    .flatMap((i) => i.transactions)
    .filter((tx) => tx.type === "sale")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

  if (firstSale) {
    timeline.push({
      label: "Payment received",
      date: firstSale.createdAt.toISOString(),
      type: "paid",
    });
  }

  // Refund/void transactions
  const refundTxs = order.items
    .flatMap((i) => i.transactions.map((tx) => ({ ...tx, item: i })))
    .filter((tx) => tx.type === "refund" || tx.type === "void")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const tx of refundTxs) {
    const desc = `${tx.item.listing.variant.product.title} Size ${tx.item.listing.variant.size}`;
    timeline.push({
      label: tx.type === "refund" ? `Refund processed — ${desc}` : `Void — ${desc}`,
      date: tx.createdAt.toISOString(),
      type: tx.type as "refund" | "void",
    });
  }

  if (order.status === "cancelled") {
    timeline.push({
      label: "Order cancelled",
      date: refundTxs.length > 0 ? refundTxs[refundTxs.length - 1].createdAt.toISOString() : order.createdAt.toISOString(),
      type: "void",
    });
  }

  timeline.reverse();

  return {
    order,
    summary: {
      totalFees,
      totalConsignorPayout,
      itemCount: order.items.length,
      refundedCount,
    },
    timeline,
  };
}
