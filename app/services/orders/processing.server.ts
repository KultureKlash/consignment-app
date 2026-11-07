import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { syncInventory } from "~/services/inventory";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { ORDER_STATUS, ORDER_PAYMENT_STATUS, TRANSACTION_TYPE } from "~/lib/order-statuses";
import { calculateFee, ZERO } from "~/lib/finance";
import { sendItemSoldEmail } from "~/services/email";
import { logger } from "~/lib/system";

/** What Shopify charged the customer. Bookkeeping only — never feeds a credit. */
export type ShopifyOrderTotals = {
  subtotal: number;
  discounts: number;
  tax: number;
  shipping: number;
  total: number;
};

/** A Shopify line item with no local Variant row. Recorded on the Order. */
export type UnmappedLineItem = {
  shopifyVariantId: string;
  quantity: number;
  price: number;
  reason: "variant_not_found";
};

/** Push current DB-derived quantity to Shopify for each variant. */
async function syncVariants(admin: AdminApiContext, variantIds: Set<string>) {
  for (const variantId of variantIds) {
    const variant = await prisma.variant.findUniqueOrThrow({
      where: { id: variantId },
    });
    await syncInventory({ admin, variant });
  }
}

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
  shopifyTotals,
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
  /**
   * What Shopify charged the customer. Stored for reconciliation only — never
   * used to compute a consignor credit. Consignors are paid on their listing
   * price and the store absorbs discounts (see CLAUDE.md).
   */
  shopifyTotals?: ShopifyOrderTotals;
}) {
  const existing = await prisma.order.findUnique({
    where: { shopifyId: shopifyOrderId },
    include: { items: { include: { listing: { select: { variantId: true } } } } },
  });

  if (existing) {
    // Redelivery. The allocation transaction below is atomic, but syncInventory
    // and creditOrder run after it commits — if either failed last time, the
    // order exists while Shopify still shows stock and the consignor is
    // uncredited. Returning early here stranded that state permanently, so
    // resume both instead. Safe to repeat: syncInventory sets an absolute
    // quantity from the DB, and creditOrder no-ops once paymentStatus is paid.
    await syncVariants(admin, new Set(existing.items.map((i) => i.listing.variantId)));

    if (financialStatus === ORDER_PAYMENT_STATUS.PAID) {
      await creditOrder({ shopifyOrderId });
    }

    return prisma.order.findUniqueOrThrow({
      where: { shopifyId: shopifyOrderId },
      include: { items: true },
    });
  }

  // Track which variants were affected for inventory sync after commit
  const affectedVariantIds = new Set<string>();
  const unmappedLineItems: UnmappedLineItem[] = [];

  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        shopifyId: shopifyOrderId,
        orderNumber: orderNumber ?? null,
        total: 0,
        status: ORDER_STATUS.OPEN,
        paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
        ...(shopifyTotals
          ? {
              shopifySubtotal: shopifyTotals.subtotal,
              shopifyDiscounts: shopifyTotals.discounts,
              shopifyTax: shopifyTotals.tax,
              shopifyShipping: shopifyTotals.shipping,
              shopifyTotal: shopifyTotals.total,
            }
          : {}),
      },
    });

    // Decimal, not a number: this is summed from numeric(10,2) columns and
    // written straight back to one.
    let orderTotal = ZERO;

    for (const lineItem of lineItems) {
      const variant = await tx.variant.findUnique({
        where: { shopifyVariantId: lineItem.shopifyVariantId },
      });

      if (!variant) {
        // Not a consignment item: a gift card, a product created outside this
        // app, or a deleted variant. Record it and keep going — aborting threw
        // away the whole order, so any consignment items in the same cart were
        // never marked sold and never credited.
        unmappedLineItems.push({
          shopifyVariantId: lineItem.shopifyVariantId,
          quantity: lineItem.quantity,
          price: lineItem.price,
          reason: "variant_not_found",
        });
        continue;
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

        orderTotal = orderTotal.plus(listing.price);
      }
    }

    return tx.order.update({
      where: { id: newOrder.id },
      data: {
        total: orderTotal,
        ...(unmappedLineItems.length > 0 ? { unmappedLineItems } : {}),
      },
      include: { items: true },
    });
  });

  if (unmappedLineItems.length > 0) {
    logger.warn("Order has line items with no local variant", {
      shopifyOrderId,
      count: unmappedLineItems.length,
      shopifyVariantIds: unmappedLineItems.map((u) => u.shopifyVariantId),
    });
  }

  // Sync inventory for all affected variants (after transaction commits)
  await syncVariants(admin, affectedVariantIds);

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
      const listingCost = item.listing.cost ?? ZERO;
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

      // Email bodies are display text, so money becomes a number here. This is
      // a deliberate, documented boundary: nothing downstream of it writes.
      const soldItem = {
        product: item.listing.variant.product.title,
        size: item.listing.variant.size,
        salePrice: item.price.toNumber(),
        payoutAmount: consignorAmount.toNumber(),
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
