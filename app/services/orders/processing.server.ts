import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { syncInventory } from "~/services/inventory";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { ORDER_STATUS, ORDER_PAYMENT_STATUS, TRANSACTION_TYPE } from "~/lib/order-statuses";
import { calculateFee } from "~/lib/fee-calc";
import { sendItemSoldEmail } from "~/services/email";

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
      data: { shopifyId: shopifyOrderId, orderNumber: orderNumber ?? null, total: 0, status: ORDER_STATUS.OPEN, paymentStatus: ORDER_PAYMENT_STATUS.PENDING },
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

      // Lock rows with FOR UPDATE SKIP LOCKED to prevent double-selling
      const lockedIds = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Listing"
        WHERE "variantId" = ${variant.id}
        AND "status" = ${LISTING_STATUS.ACTIVE}
        ORDER BY "price" ASC, "createdAt" ASC
        LIMIT ${lineItem.quantity}
        FOR UPDATE SKIP LOCKED
      `;

      if (lockedIds.length < lineItem.quantity) {
        throw new Error(
          `Insufficient inventory for variant ${lineItem.shopifyVariantId}: needed ${lineItem.quantity}, available ${lockedIds.length}`
        );
      }

      const listings = await tx.listing.findMany({
        where: { id: { in: lockedIds.map((r) => r.id) } },
        include: { consignor: true },
      });

      for (const listing of listings) {
        // ACTIVE listings always have a price (enforced by AWAITING_PRICE → ACTIVE flow)
        if (listing.price == null) {
          throw new Error(`Listing ${listing.id} is ACTIVE but has no price — data integrity error`);
        }
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
  if (financialStatus === ORDER_PAYMENT_STATUS.PAID) {
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
  if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) return order;
  if (order.status === ORDER_STATUS.CANCELLED) return order;

  // Group sold items by consignor so we can send ONE email per consignor per order
  // (instead of N emails for N items in the same purchase).
  type SoldBucket = {
    consignor: typeof order.items[0]["listing"]["consignor"];
    items: Array<{ product: string; size: string; salePrice: number; payoutAmount: number }>;
  };
  const soldByConsignor = new Map<string, SoldBucket>();

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      if (item.transactions.some((t) => t.type === TRANSACTION_TYPE.SALE)) continue;

      const grossAmount = item.price;
      const feeRate = item.listing.consignor.feeRate;
      const { feeAmount, consignorAmount } = calculateFee(grossAmount, feeRate);
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
          type: TRANSACTION_TYPE.SALE,
        },
      });

      await tx.listing.update({
        where: { id: item.listingId },
        data: { status: LISTING_STATUS.SOLD },
      });

      const soldItem = {
        product: item.listing.variant.product.title,
        size: item.listing.variant.size,
        salePrice: item.price,
        payoutAmount: consignorAmount,
      };
      const bucket = soldByConsignor.get(item.listing.consignorId);
      if (bucket) {
        bucket.items.push(soldItem);
      } else {
        soldByConsignor.set(item.listing.consignorId, {
          consignor: item.listing.consignor,
          items: [soldItem],
        });
      }
    }

    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: ORDER_PAYMENT_STATUS.PAID },
    });
  });

  // Send consolidated emails AFTER the DB transaction commits (one per consignor)
  for (const { consignor, items } of soldByConsignor.values()) {
    sendItemSoldEmail(consignor, items).catch(() => {});
  }

  return order;
}
