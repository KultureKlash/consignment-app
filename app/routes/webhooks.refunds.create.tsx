import { unauthenticated } from "../shopify.server";
import { refundOrder } from "~/services/orders.server";
import { createWebhookHandler } from "~/services/webhooks.server";

export const action = createWebhookHandler({
  idPrefix: "refund",
  getObjectId: (payload) => `gid://shopify/Order/${payload.order_id}`,
  handler: async ({ shop, payload, shopifyObjectId }) => {
    const { admin } = await unauthenticated.admin(shop);

    const refundLineItems = payload.refund_line_items?.map(
      (item: { line_item: { variant_id: number }; quantity: number; restock_type?: string }) => ({
        shopifyVariantId: `gid://shopify/ProductVariant/${item.line_item.variant_id}`,
        quantity: item.quantity,
        restockType: item.restock_type as "return" | "cancel" | "no_restock" | undefined,
      }),
    );

    await refundOrder({ admin, shopifyOrderId: shopifyObjectId, refundLineItems });
  },
});
