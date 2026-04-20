import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { syncInventory } from "~/services/inventory";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { ORDER_STATUS, ORDER_PAYMENT_STATUS, TRANSACTION_TYPE } from "~/lib/order-statuses";
import { PAYOUT_STATUS } from "~/lib/payout-statuses";
import { calculateFee } from "~/lib/fee-calc";

/**
 * Cancel an order — full reversal. Restores all listing statuses to "active"
 * and creates offsetting refund transactions if the order was paid.
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
  if (order.status === ORDER_STATUS.CANCELLED) throw new Error("Order already cancelled");

  // When Shopify cancels with "Refund payment", it fires refunds/create BEFORE
  // orders/cancelled. If the refund handler already processed everything and set
  // status to "refunded", we just need to update status to "cancelled".
  if (order.status === ORDER_STATUS.REFUNDED) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: ORDER_STATUS.CANCELLED },
    });
    return;
  }

  const wasPaid = order.paymentStatus === ORDER_PAYMENT_STATUS.PAID;
  const txType = wasPaid ? TRANSACTION_TYPE.REFUND : "void";
  const affectedVariantIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      if (item.status === "refunded") continue;

      await refundItem(tx, { ...item, orderId: order.id }, affectedVariantIds, {
        restoreInventory: true,
        wasPaid,
        txType,
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: ORDER_STATUS.CANCELLED,
        total: 0,
        paymentStatus: order.paymentStatus === ORDER_PAYMENT_STATUS.PAID
          ? "refunded"
          : "voided",
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
 * (highest price first, newest listing first) to determine which items
 * to refund.
 *
 * If refundLineItems is omitted, refunds the entire order.
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
  if (order.status === ORDER_STATUS.CANCELLED) throw new Error("Order is cancelled");
  if (order.status === ORDER_STATUS.REFUNDED) throw new Error("Order already fully refunded");
  if (order.paymentStatus === ORDER_PAYMENT_STATUS.PENDING) {
    throw new Error("Cannot refund an unpaid order — cancel it instead");
  }

  const affectedVariantIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    if (!refundLineItems) {
      // Full refund — reverse allocation: highest price first, newest first
      const refundableItems = order.items
        .filter((item) => item.status === "sold" || item.status === "pending_sale")
        .sort((a, b) =>
          b.price - a.price ||
          b.listing.createdAt.getTime() - a.listing.createdAt.getTime()
        );

      for (const item of refundableItems) {
        await refundItem(tx, item, affectedVariantIds, {
          restoreInventory: true,
          wasPaid: true,
          txType: TRANSACTION_TYPE.REFUND,
        });
      }
    } else {
      // Partial refund — match refund lines to order items by variant
      for (const refundLine of refundLineItems) {
        const matchingItems = order.items
          .filter(
            (item) =>
              (item.status === "sold" || item.status === "pending_sale") &&
              item.listing.variant.shopifyVariantId === refundLine.shopifyVariantId
          )
          .sort((a, b) =>
            b.price - a.price ||
            b.listing.createdAt.getTime() - a.listing.createdAt.getTime()
          );

        if (refundLine.quantity > matchingItems.length) {
          throw new Error(
            `Cannot refund ${refundLine.quantity} units of variant ${refundLine.shopifyVariantId}: only ${matchingItems.length} available to refund`
          );
        }

        const restoreInventory = ["return", "cancel"].includes(
          refundLine.restockType ?? "return"
        );

        for (let i = 0; i < refundLine.quantity; i++) {
          await refundItem(tx, matchingItems[i], affectedVariantIds, {
            restoreInventory,
            wasPaid: true,
            txType: TRANSACTION_TYPE.REFUND,
          });
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
        ...(allRefunded
          ? { status: ORDER_STATUS.REFUNDED, paymentStatus: "refunded" }
          : {}),
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
  transactions: Array<{
    type: string;
    payoutItems: Array<{ payout: { status: string } }>;
  }>,
): boolean {
  return transactions.some(
    (t) =>
      t.type === TRANSACTION_TYPE.SALE &&
      t.payoutItems.some((pi) => pi.payout.status === PAYOUT_STATUS.PAID),
  );
}

/**
 * Get or create the shop consignor for reassigned items.
 * Footwear -> "Kulture Klash", everything else -> "Kulture Klothing".
 * Shop consignors have 100% fee rate (marketplace keeps everything).
 */
async function getShopConsignorId(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  category: string | null | undefined,
): Promise<string> {
  const isFootwear = !category || category.startsWith("Footwear");
  const name = isFootwear ? "Kulture Klash" : "Kulture Klothing";
  const email = isFootwear
    ? "shop-footwear@kultureklash.com"
    : "shop-clothing@kultureklothing.com";

  const existing = await tx.consignor.findFirst({ where: { name } });
  if (existing) return existing.id;

  const created = await tx.consignor.create({
    data: { name, email, feeRate: 1.0 },
  });
  return created.id;
}

/**
 * Refund a single order item. Sets OrderItem status to "refunded",
 * restores listing to "active" (if restocking), and creates refund
 * transaction.
 *
 * Post-payout refund: if the sale was already paid out to the consignor,
 * we do NOT create a negative transaction. Instead, we create a new
 * listing under the shop consignor so the shop can resell.
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
      variant: {
        shopifyVariantId?: string | null;
        product: { category: string | null };
      };
    };
    transactions: Array<{
      type: string;
      feeRate: number;
      cost?: number;
      payoutItems: Array<{ payout: { status: string } }>;
    }>;
  },
  affectedVariantIds: Set<string>,
  opts: { restoreInventory: boolean; wasPaid: boolean; txType: string },
) {
  const { restoreInventory, wasPaid, txType } = opts;
  const postPayout = wasPaid && isPostPaidPayout(item.transactions);

  await tx.orderItem.update({
    where: { id: item.id },
    data: { status: "refunded" },
  });

  if (postPayout) {
    // Post-payout refund: don't create negative transaction, reassign
    if (restoreInventory) {
      affectedVariantIds.add(item.listing.variantId);

      const shopConsignorId = await getShopConsignorId(
        tx,
        item.listing.variant.product.category,
      );

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
  } else {
    // Normal path: restore listing + create negative transaction
    if (restoreInventory) {
      affectedVariantIds.add(item.listing.variantId);
      await tx.listing.update({
        where: { id: item.listingId },
        data: { status: LISTING_STATUS.ACTIVE, soldAt: null },
      });
    }

    if (wasPaid) {
      const saleTx = item.transactions.find(
        (t) => t.type === TRANSACTION_TYPE.SALE,
      );
      const rate = saleTx?.feeRate ?? item.listing.consignor.feeRate;
      const refundCost = saleTx?.cost ?? item.listing.cost ?? 0;
      const refundGross = item.price;
      const { feeAmount: refundFee, consignorAmount: refundConsignor } =
        calculateFee(refundGross, rate);

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
