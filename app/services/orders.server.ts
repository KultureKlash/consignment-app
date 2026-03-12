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
      data: { shopifyId: shopifyOrderId, total: 0 },
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
        await tx.orderItem.create({
          data: {
            orderId: newOrder.id,
            listingId: listing.id,
            price: listing.price,
            quantity: take,
          },
        });

        // Create transaction for consignor
        const saleAmount = listing.price * take * listing.consignor.commissionRate;
        await tx.transaction.create({
          data: {
            consignorId: listing.consignorId,
            amount: saleAmount,
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
