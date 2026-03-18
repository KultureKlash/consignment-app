import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { syncInventory } from "~/services/inventory.server";

/**
 * Process an incoming order — allocate per-item listings to order items.
 *
 * Allocation priority (StockX-style):
 *   ORDER BY price ASC, createdAt ASC
 *   → lowest price first, oldest listing first (FIFO tiebreak)
 *
 * Invariant: a listing cannot be sold if its status is not "active".
 */
export async function processOrder({
  admin,
  shopifyOrderId,
  lineItems,
  financialStatus,
}: {
  admin: AdminApiContext;
  shopifyOrderId: string;
  lineItems: Array<{
    shopifyVariantId: string;
    quantity: number;
    price: number;
  }>;
  financialStatus?: string;
}) {
  // Idempotency: if this order was already processed, return it
  const existing = await prisma.order.findUnique({
    where: { shopifyId: shopifyOrderId },
    include: { items: true },
  });
  if (existing) return existing;

  // Track which variants were affected for inventory sync after commit
  const affectedVariantIds = new Set<string>();

  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: { shopifyId: shopifyOrderId, total: 0, status: "open", paymentStatus: "pending" },
    });

    let orderTotal = 0;

    for (const lineItem of lineItems) {
      // Find the local variant by Shopify variant ID
      const variant = await tx.variant.findUnique({
        where: { shopifyVariantId: lineItem.shopifyVariantId },
      });

      if (!variant) {
        throw new Error(
          `Variant not found for Shopify ID: ${lineItem.shopifyVariantId}`
        );
      }

      affectedVariantIds.add(variant.id);

      // Per-item allocation: find N active listings, lowest price first, FIFO tiebreak
      // SQLite serializes writes implicitly; PostgreSQL needs FOR UPDATE (handled by DB adapter)
      const listings = await tx.listing.findMany({
        where: { variantId: variant.id, status: "active" },
        orderBy: [{ price: "asc" }, { createdAt: "asc" }],
        take: lineItem.quantity,
        include: { consignor: true },
      });

      if (listings.length < lineItem.quantity) {
        throw new Error(
          `Insufficient inventory for variant ${lineItem.shopifyVariantId}: needed ${lineItem.quantity}, available ${listings.length}`
        );
      }

      for (const listing of listings) {
        // Mark listing as sold
        await tx.listing.update({
          where: { id: listing.id },
          data: { status: "sold", soldAt: new Date() },
        });

        // Create order item (1 per listing)
        await tx.orderItem.create({
          data: {
            orderId: newOrder.id,
            listingId: listing.id,
            price: listing.price,
          },
        });

        orderTotal += listing.price;
      }
    }

    // Update order total
    return tx.order.update({
      where: { id: newOrder.id },
      data: { total: orderTotal },
      include: { items: true },
    });
  });

  // Sync inventory for all affected variants (after transaction commits)
  for (const variantId of affectedVariantIds) {
    const variant = await prisma.variant.findUniqueOrThrow({
      where: { id: variantId },
    });
    await syncInventory({ admin, variant });
  }

  // If payment is already captured, credit the consignor balance immediately
  if (financialStatus === "paid") {
    await creditOrder({ shopifyOrderId });
    // Re-fetch to return the updated paymentStatus
    return prisma.order.findUniqueOrThrow({
      where: { shopifyId: shopifyOrderId },
      include: { items: true },
    });
  }

  return order;
}

/**
 * Credit consignor balances for a paid order. Creates sale Transactions
 * for each order item. Called either from processOrder (if already paid)
 * or from the orders/paid webhook (deferred payment).
 *
 * Idempotent: returns early if order is already paymentStatus "paid".
 */
export async function creditOrder({
  shopifyOrderId,
}: {
  shopifyOrderId: string;
}) {
  const order = await prisma.order.findUnique({
    where: { shopifyId: shopifyOrderId },
    include: {
      items: {
        include: {
          listing: { include: { consignor: true } },
          transactions: true,
        },
      },
    },
  });

  if (!order) throw new Error(`Order not found: ${shopifyOrderId}`);
  if (order.paymentStatus === "paid") return order; // idempotent
  if (order.status === "cancelled") return order; // don't credit cancelled orders

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      // Skip if sale transactions already exist (defensive)
      if (item.transactions.some((t) => t.type === "sale")) continue;

      const grossAmount = item.price;
      const commissionAmount = grossAmount * item.listing.consignor.commissionRate;
      await tx.transaction.create({
        data: {
          consignorId: item.listing.consignorId,
          orderItemId: item.id,
          salePrice: item.price,
          commissionRate: item.listing.consignor.commissionRate,
          grossAmount,
          commissionAmount,
          amount: commissionAmount,
          type: "sale",
        },
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: "paid" },
    });
  });

  return order;
}

/**
 * Cancel an order — full reversal. Restores all listing statuses to "active"
 * and creates offsetting refund transactions if the order was paid.
 *
 * Refund priority (reverse allocation):
 *   ORDER BY price DESC, createdAt DESC
 *   → last allocated item refunded first
 */
export async function cancelOrder({
  admin,
  shopifyOrderId,
}: {
  admin: AdminApiContext;
  shopifyOrderId: string;
}) {
  const order = await prisma.order.findUnique({
    where: { shopifyId: shopifyOrderId },
    include: {
      items: {
        include: {
          listing: { include: { consignor: true, variant: true } },
          transactions: true,
        },
      },
    },
  });

  if (!order) throw new Error(`Order not found: ${shopifyOrderId}`);
  if (order.status === "cancelled") throw new Error("Order already cancelled");

  // When Shopify cancels with "Refund payment", it fires refunds/create BEFORE
  // orders/cancelled. If the refund handler already processed everything and set
  // status to "refunded", we just need to update status to "cancelled".
  if (order.status === "refunded") {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "cancelled" },
    });
    return;
  }

  const txType = order.paymentStatus === "paid" ? "refund" : "void";
  const affectedVariantIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      if (item.status === "refunded") continue; // already refunded

      affectedVariantIds.add(item.listing.variantId);

      // Restore listing to active
      await tx.listing.update({
        where: { id: item.listingId },
        data: { status: "active", soldAt: null },
      });

      // Mark order item as refunded
      await tx.orderItem.update({
        where: { id: item.id },
        data: { status: "refunded" },
      });

      // Only create offsetting transactions if the order was actually paid
      if (order.paymentStatus === "paid") {
        const saleTx = item.transactions.find((t) => t.type === "sale");
        const rate = saleTx?.commissionRate ?? item.listing.consignor.commissionRate;
        const refundGross = item.price;
        const refundCommission = refundGross * rate;
        await tx.transaction.create({
          data: {
            consignorId: item.listing.consignorId,
            orderItemId: item.id,
            salePrice: item.price,
            commissionRate: rate,
            grossAmount: -refundGross,
            commissionAmount: -refundCommission,
            amount: -refundCommission,
            type: txType,
          },
        });
      }
    }

    // Update order status and paymentStatus
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "cancelled",
        total: 0,
        paymentStatus: order.paymentStatus === "paid" ? "refunded" : "voided",
      },
    });
  });

  // Sync inventory for affected variants
  for (const variantId of affectedVariantIds) {
    const variant = await prisma.variant.findUniqueOrThrow({
      where: { id: variantId },
    });
    await syncInventory({ admin, variant });
  }
}

/**
 * Refund an order — full or partial. Uses reverse allocation priority
 * (highest price first, newest listing first) to determine which items to refund.
 *
 * If refundLineItems is omitted, refunds the entire order (all non-refunded items).
 */
export async function refundOrder({
  admin,
  shopifyOrderId,
  refundLineItems,
}: {
  admin: AdminApiContext;
  shopifyOrderId: string;
  refundLineItems?: Array<{
    shopifyVariantId: string;
    quantity: number;
    restockType?: "return" | "cancel" | "no_restock";
  }>;
}) {
  const order = await prisma.order.findUnique({
    where: { shopifyId: shopifyOrderId },
    include: {
      items: {
        include: {
          listing: { include: { consignor: true, variant: true } },
          transactions: true,
        },
      },
    },
  });

  if (!order) throw new Error(`Order not found: ${shopifyOrderId}`);
  if (order.status === "cancelled") throw new Error("Order is cancelled");
  if (order.status === "refunded") throw new Error("Order already fully refunded");
  if (order.paymentStatus === "pending") throw new Error("Cannot refund an unpaid order — cancel it instead");

  const affectedVariantIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    if (!refundLineItems) {
      // Full refund — refund all non-refunded items
      // Reverse allocation: highest price first, newest listing first
      const refundableItems = order.items
        .filter((item) => item.status === "sold")
        .sort((a, b) => b.price - a.price || b.listing.createdAt.getTime() - a.listing.createdAt.getTime());

      for (const item of refundableItems) {
        await refundItem(tx, item, affectedVariantIds, true);
      }
    } else {
      // Partial refund — match refund lines to order items by variant
      for (const refundLine of refundLineItems) {
        // Find order items for this variant that are still sold
        // Reverse allocation: highest price first, newest first
        const matchingItems = order.items
          .filter(
            (item) =>
              item.status === "sold" &&
              item.listing.variant.shopifyVariantId === refundLine.shopifyVariantId
          )
          .sort((a, b) => b.price - a.price || b.listing.createdAt.getTime() - a.listing.createdAt.getTime());

        // Over-refund protection
        if (refundLine.quantity > matchingItems.length) {
          throw new Error(
            `Cannot refund ${refundLine.quantity} units of variant ${refundLine.shopifyVariantId}: only ${matchingItems.length} available to refund`
          );
        }

        const restoreInventory = ["return", "cancel"].includes(refundLine.restockType ?? "return");

        for (let i = 0; i < refundLine.quantity; i++) {
          await refundItem(tx, matchingItems[i], affectedVariantIds, restoreInventory);
        }
      }
    }

    // Check if fully refunded
    const updatedItems = await tx.orderItem.findMany({
      where: { orderId: order.id },
    });
    const allRefunded = updatedItems.every((item) => item.status === "refunded");
    const newTotal = updatedItems
      .filter((item) => item.status === "sold")
      .reduce((sum, item) => sum + item.price, 0);

    await tx.order.update({
      where: { id: order.id },
      data: {
        total: newTotal,
        ...(allRefunded ? { status: "refunded", paymentStatus: "refunded" } : {}),
      },
    });
  });

  // Sync inventory for affected variants
  for (const variantId of affectedVariantIds) {
    const variant = await prisma.variant.findUniqueOrThrow({
      where: { id: variantId },
    });
    await syncInventory({ admin, variant });
  }
}

/**
 * Refund a single order item. Sets OrderItem status to "refunded",
 * restores listing to "active" (if restocking), and creates refund transaction.
 */
async function refundItem(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  item: {
    id: string;
    price: number;
    listingId: string;
    listing: {
      consignorId: string;
      variantId: string;
      consignor: { commissionRate: number };
    };
    transactions: Array<{ type: string; commissionRate: number }>;
  },
  affectedVariantIds: Set<string>,
  restoreInventory: boolean,
) {
  // Restore listing to active (if restocking)
  if (restoreInventory) {
    affectedVariantIds.add(item.listing.variantId);
    await tx.listing.update({
      where: { id: item.listingId },
      data: { status: "active", soldAt: null },
    });
  }

  // Mark order item as refunded
  await tx.orderItem.update({
    where: { id: item.id },
    data: { status: "refunded" },
  });

  // Create refund transaction
  const saleTx = item.transactions.find((t) => t.type === "sale");
  const rate = saleTx?.commissionRate ?? item.listing.consignor.commissionRate;
  const refundGross = item.price;
  const refundCommission = refundGross * rate;

  await tx.transaction.create({
    data: {
      consignorId: item.listing.consignorId,
      orderItemId: item.id,
      salePrice: item.price,
      commissionRate: rate,
      grossAmount: -refundGross,
      commissionAmount: -refundCommission,
      amount: -refundCommission,
      type: "refund",
    },
  });
}

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
      where: { consignorId, status: "completed" },
      _sum: { amount: true },
    }),
  ]);

  const totalEarnings = txAgg._sum.amount ?? 0;
  const totalPayouts = payoutAgg._sum.amount ?? 0;

  return totalEarnings - totalPayouts;
}
