import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { syncInventory } from "~/services/inventory.server";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { sendItemSoldEmail } from "~/services/email.server";

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
  orderNumber,
  lineItems,
  financialStatus,
}: {
  admin: AdminApiContext;
  shopifyOrderId: string;
  orderNumber?: string;
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
      data: { shopifyId: shopifyOrderId, orderNumber: orderNumber ?? null, total: 0, status: "open", paymentStatus: "pending" },
    });

    let orderTotal = 0;

    for (const lineItem of lineItems) {
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
        where: { variantId: variant.id, status: LISTING_STATUS.ACTIVE },
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
        await tx.listing.update({
          where: { id: listing.id },
          data: { status: LISTING_STATUS.PENDING_SALE, soldAt: new Date() },
        });

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
          listing: { include: { consignor: true, variant: { include: { product: true } } } },
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
      const feeRate = item.listing.consignor.feeRate;
      const feeAmount = grossAmount * feeRate;
      const consignorAmount = grossAmount - feeAmount;
      const listingCost = item.listing.cost ?? 0;
      await tx.transaction.create({
        data: {
          consignorId: item.listing.consignorId,
          orderItemId: item.id,
          salePrice: item.price,
          cost: listingCost,
          feeRate,
          grossAmount,
          feeAmount,
          consignorAmount,
          amount: consignorAmount,
          type: "sale",
        },
      });

      await tx.listing.update({
        where: { id: item.listingId },
        data: { status: LISTING_STATUS.SOLD },
      });

      sendItemSoldEmail(item.listing.consignor, {
        product: item.listing.variant.product.title,
        size: item.listing.variant.size,
        salePrice: item.price,
        payoutAmount: consignorAmount,
      }).catch(() => {});
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
          listing: { include: { consignor: true, variant: { include: { product: true } } } },
          transactions: { include: { payoutItems: { include: { payout: true } } } },
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

  const wasPaid = order.paymentStatus === "paid";
  const txType = wasPaid ? "refund" : "void";
  const affectedVariantIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      if (item.status === "refunded") continue; // already refunded

      await refundItem(tx, { ...item, orderId: order.id }, affectedVariantIds, true, { wasPaid, txType });
    }

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
          listing: { include: { consignor: true, variant: { include: { product: true } } } },
          transactions: { include: { payoutItems: { include: { payout: true } } } },
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
        .filter((item) => item.status === "sold" || item.status === "pending_sale")
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
              (item.status === "sold" || item.status === "pending_sale") &&
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
      .filter((item) => item.status === "sold" || item.status === "pending_sale")
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
 * Check if any sale transaction for this item was included in a paid payout.
 * If so, the consignor already received the money — we absorb the loss.
 */
function isPostPaidPayout(
  transactions: Array<{ type: string; payoutItems: Array<{ payout: { status: string } }> }>,
): boolean {
  return transactions.some(
    (t) => t.type === "sale" && t.payoutItems.some((pi) => pi.payout.status === "paid"),
  );
}

/**
 * Get or create the shop consignor for reassigned items.
 * Footwear → "Kulture Klash", everything else → "Kulture Klothing".
 * Shop consignors have 100% fee rate (marketplace keeps everything, no payouts).
 */
async function getShopConsignorId(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  category: string | null | undefined,
): Promise<string> {
  const isFootwear = !category || category.startsWith("Footwear");
  const name = isFootwear ? "Kulture Klash" : "Kulture Klothing";
  const email = isFootwear ? "shop-footwear@kultureklash.com" : "shop-clothing@kultureklothing.com";

  const existing = await tx.consignor.findFirst({ where: { name } });
  if (existing) return existing.id;

  const created = await tx.consignor.create({
    data: { name, email, feeRate: 1.0 },
  });
  return created.id;
}

/**
 * Refund a single order item. Sets OrderItem status to "refunded",
 * restores listing to "active" (if restocking), and creates refund transaction.
 *
 * Post-payout refund: if the sale was already paid out to the consignor,
 * we do NOT create a negative transaction. Instead, we create a new listing
 * under the shop consignor (Kulture Klash / Kulture Klothing) so the shop
 * can resell and recover the cost.
 */
async function refundItem(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  item: {
    id: string;
    price: number;
    listingId: string;
    orderId?: string;
    listing: {
      consignorId: string;
      variantId: string;
      cost?: number | null;
      consignor: { feeRate: number };
      variant: { shopifyVariantId?: string | null; product: { category: string | null } };
    };
    transactions: Array<{ type: string; feeRate: number; cost?: number; payoutItems: Array<{ payout: { status: string } }> }>;
  },
  affectedVariantIds: Set<string>,
  restoreInventory: boolean,
  options?: { txType?: string; wasPaid?: boolean },
) {
  const wasPaid = options?.wasPaid ?? true;
  const txType = options?.txType ?? "refund";
  const postPayout = wasPaid && isPostPaidPayout(item.transactions);

  await tx.orderItem.update({
    where: { id: item.id },
    data: { status: "refunded" },
  });

  if (postPayout) {
    // Post-payout refund: don't create negative transaction, reassign to shop consignor
    if (restoreInventory) {
      affectedVariantIds.add(item.listing.variantId);

      const shopConsignorId = await getShopConsignorId(tx, item.listing.variant.product.category);

      // Create new listing under shop consignor (original stays "sold" for history)
      const newListing = await tx.listing.create({
        data: {
          consignorId: shopConsignorId,
          variantId: item.listing.variantId,
          price: item.price,
          status: LISTING_STATUS.ACTIVE,
          reassignedFromConsignorId: item.listing.consignorId,
          reassignedFromListingId: item.listingId,
        },
      });

      await tx.reassignmentLog.create({
        data: {
          originalListingId: item.listingId,
          newListingId: newListing.id,
          originalConsignorId: item.listing.consignorId,
          newConsignorId: shopConsignorId,
          orderId: item.orderId,
          reason: "post_payout_refund",
        },
      });
    }
    // No refund transaction — consignor already got paid
  } else {
    // Normal path: restore listing + create negative transaction (only if order was paid)
    if (restoreInventory) {
      affectedVariantIds.add(item.listing.variantId);
      await tx.listing.update({
        where: { id: item.listingId },
        data: { status: LISTING_STATUS.ACTIVE, soldAt: null },
      });
    }

    if (wasPaid) {
      const saleTx = item.transactions.find((t) => t.type === "sale");
      const rate = saleTx?.feeRate ?? item.listing.consignor.feeRate;
      const refundCost = saleTx?.cost ?? item.listing.cost ?? 0;
      const refundGross = item.price;
      const refundFee = refundGross * rate;
      const refundConsignor = refundGross - refundFee;

      await tx.transaction.create({
        data: {
          consignorId: item.listing.consignorId,
          orderItemId: item.id,
          salePrice: item.price,
          cost: refundCost,
          feeRate: rate,
          grossAmount: -refundGross,
          feeAmount: -refundFee,
          consignorAmount: -refundConsignor,
          amount: -refundConsignor,
          type: txType,
        },
      });
    }
  }
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
      where: { consignorId, status: "paid" },
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
    where: { consignorId, status: "paid" },
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
    data: { fulfilledAt: new Date(), status: "fulfilled" },
  });
}
