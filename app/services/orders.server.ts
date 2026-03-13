import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { syncInventory } from "~/services/inventory.server";

export async function processOrder({
  admin,
  shopifyOrderId,
  lineItems,
}: {
  admin: AdminApiContext;
  shopifyOrderId: string;
  lineItems: Array<{
    shopifyVariantId: string;
    quantity: number;
    price: number;
  }>;
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
      data: { shopifyId: shopifyOrderId, total: 0, status: "open" },
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

      // Get active listings sorted by price ASC, then createdAt ASC (FIFO tiebreak)
      const listings = await tx.listing.findMany({
        where: { variantId: variant.id, status: "active" },
        orderBy: [{ price: "asc" }, { createdAt: "asc" }],
        include: { consignor: true },
      });

      let remaining = lineItem.quantity;

      for (const listing of listings) {
        if (remaining <= 0) break;

        const take = Math.min(listing.quantity, remaining);
        const newQty = listing.quantity - take;

        // Deduct from listing
        await tx.listing.update({
          where: { id: listing.id },
          data: {
            quantity: newQty,
            ...(newQty === 0 ? { status: "sold" } : {}),
          },
        });

        // Create order item
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: newOrder.id,
            listingId: listing.id,
            price: listing.price,
            quantity: take,
          },
        });

        // Create transaction for consignor, linked to order item
        const grossAmount = listing.price * take;
        const commissionAmount = grossAmount * listing.consignor.commissionRate;
        await tx.transaction.create({
          data: {
            consignorId: listing.consignorId,
            orderItemId: orderItem.id,
            salePrice: listing.price,
            quantity: take,
            commissionRate: listing.consignor.commissionRate,
            grossAmount,
            commissionAmount,
            amount: commissionAmount,
            type: "sale",
          },
        });

        orderTotal += listing.price * take;
        remaining -= take;
      }

      if (remaining > 0) {
        throw new Error(
          `Insufficient inventory for variant ${lineItem.shopifyVariantId}: needed ${lineItem.quantity}, available ${lineItem.quantity - remaining}`
        );
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

  return order;
}

/**
 * Cancel an order — full reversal. Used when payment was never captured
 * or the order is rejected. Restores all listing quantities and creates
 * offsetting refund transactions.
 *
 * Respects partially-refunded items: only restores the un-refunded portion.
 */
export async function cancelOrder({
  admin,
  shopifyOrderId,
  financialStatus,
}: {
  admin: AdminApiContext;
  shopifyOrderId: string;
  financialStatus?: string;
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

  // Determine transaction type: void (payment never captured) vs refund (payment was captured)
  const CAPTURED_STATUSES = ["paid", "partially_paid", "refunded", "partially_refunded"];
  const paymentCaptured = CAPTURED_STATUSES.includes(financialStatus ?? "");
  const txType = paymentCaptured ? "refund" : "void";

  const affectedVariantIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      const quantityToRestore = item.quantity - item.quantityRefunded;
      if (quantityToRestore === 0) continue;

      affectedVariantIds.add(item.listing.variantId);

      // Restore listing quantity
      const newQty = item.listing.quantity + quantityToRestore;
      await tx.listing.update({
        where: { id: item.listingId },
        data: {
          quantity: newQty,
          status: "active",
        },
      });

      // Mark order item as fully refunded
      await tx.orderItem.update({
        where: { id: item.id },
        data: { quantityRefunded: item.quantity },
      });

      // Create offsetting transaction — void if payment never captured, refund if it was
      const saleTx = item.transactions.find((t) => t.type === "sale");
      const rate = saleTx?.commissionRate ?? item.listing.consignor.commissionRate;
      const refundGross = item.price * quantityToRestore;
      const refundCommission = refundGross * rate;
      await tx.transaction.create({
        data: {
          consignorId: item.listing.consignorId,
          orderItemId: item.id,
          salePrice: item.price,
          quantity: quantityToRestore,
          commissionRate: rate,
          grossAmount: -refundGross,
          commissionAmount: -refundCommission,
          amount: -refundCommission,
          type: txType,
        },
      });
    }

    // Update order status and recalculate total
    await tx.order.update({
      where: { id: order.id },
      data: { status: "cancelled", total: 0 },
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
 * Refund an order — full or partial. Uses reverse priority (most expensive first)
 * and in-place quantityRefunded tracking for chained partial refund support.
 *
 * If refundLineItems is omitted, refunds the entire order (remaining un-refunded units).
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

  const affectedVariantIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    if (!refundLineItems) {
      // Full refund — refund all remaining units across all items
      // Sort by reverse priority: most expensive first, newest first (tiebreak)
      const itemsSorted = [...order.items]
        .filter((item) => item.quantity > item.quantityRefunded)
        .sort((a, b) => b.price - a.price || b.listing.createdAt.getTime() - a.listing.createdAt.getTime());

      for (const item of itemsSorted) {
        const refundableQty = item.quantity - item.quantityRefunded;
        await refundUnits(tx, item, refundableQty, affectedVariantIds, true);
      }
    } else {
      // Partial refund — match refund lines to order items by variant
      for (const refundLine of refundLineItems) {
        // Find order items for this variant with refundable units
        // Sort by reverse priority: most expensive first, newest first
        const matchingItems = order.items
          .filter(
            (item) =>
              item.quantity > item.quantityRefunded &&
              item.listing.variant.shopifyVariantId === refundLine.shopifyVariantId
          )
          .sort((a, b) => b.price - a.price || b.listing.createdAt.getTime() - a.listing.createdAt.getTime());

        // Over-refund protection
        const totalRefundable = matchingItems.reduce(
          (sum, item) => sum + (item.quantity - item.quantityRefunded),
          0,
        );
        if (refundLine.quantity > totalRefundable) {
          throw new Error(
            `Cannot refund ${refundLine.quantity} units of variant ${refundLine.shopifyVariantId}: only ${totalRefundable} available to refund`
          );
        }

        const restoreInventory = ["return", "cancel"].includes(refundLine.restockType ?? "return");

        let remaining = refundLine.quantity;
        for (const item of matchingItems) {
          if (remaining <= 0) break;

          const refundableQty = item.quantity - item.quantityRefunded;
          const take = Math.min(refundableQty, remaining);

          await refundUnits(tx, item, take, affectedVariantIds, restoreInventory);
          remaining -= take;
        }
      }
    }

    // Recalculate order total and check if fully refunded
    const updatedItems = await tx.orderItem.findMany({
      where: { orderId: order.id },
    });
    const allRefunded = updatedItems.every((item) => item.quantityRefunded >= item.quantity);
    const newTotal = updatedItems.reduce(
      (sum, item) => sum + item.price * (item.quantity - item.quantityRefunded),
      0,
    );

    await tx.order.update({
      where: { id: order.id },
      data: {
        total: newTotal,
        ...(allRefunded ? { status: "refunded" } : {}),
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
 * In-place refund of `refundQty` units from a single order item.
 * Increments quantityRefunded, restores listing inventory, creates refund transaction.
 */
async function refundUnits(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  item: {
    id: string;
    quantity: number;
    quantityRefunded: number;
    price: number;
    listingId: string;
    listing: {
      quantity: number;
      consignorId: string;
      variantId: string;
      consignor: { commissionRate: number };
    };
    transactions: Array<{ type: string; amount: number; salePrice: number; quantity: number; commissionRate: number; grossAmount: number; commissionAmount: number }>;
  },
  refundQty: number,
  affectedVariantIds: Set<string>,
  restoreInventory: boolean,
) {
  // Invariant: never refund more than available
  const refundableQty = item.quantity - item.quantityRefunded;
  if (refundQty > refundableQty) {
    throw new Error(
      `Cannot refund ${refundQty} units from order item ${item.id}: only ${refundableQty} refundable`
    );
  }

  // Only restore listing inventory when Shopify indicates restock (return/cancel)
  // no_restock = damaged/lost/goodwill → do NOT create ghost inventory
  if (restoreInventory) {
    affectedVariantIds.add(item.listing.variantId);

    const newListingQty = Math.max(0, item.listing.quantity + refundQty);
    await tx.listing.update({
      where: { id: item.listingId },
      data: { quantity: newListingQty, status: "active" },
    });
    item.listing.quantity = newListingQty;
  }

  // Increment quantityRefunded in-place (supports chained partial refunds)
  const newQuantityRefunded = item.quantityRefunded + refundQty;
  await tx.orderItem.update({
    where: { id: item.id },
    data: { quantityRefunded: newQuantityRefunded },
  });
  item.quantityRefunded = newQuantityRefunded;

  // Create refund transaction using original sale's commission rate snapshot
  const saleTx = item.transactions.find((t) => t.type === "sale");
  const rate = saleTx?.commissionRate ?? item.listing.consignor.commissionRate;
  const refundGross = item.price * refundQty;
  const refundCommission = refundGross * rate;

  await tx.transaction.create({
    data: {
      consignorId: item.listing.consignorId,
      orderItemId: item.id,
      salePrice: item.price,
      quantity: refundQty,
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
