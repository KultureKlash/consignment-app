import { unauthenticated } from "../shopify.server";
import { processOrder } from "~/services/orders";
import { createWebhookHandler } from "~/services/webhooks";

export const action = createWebhookHandler({
  idPrefix: "order",
  handler: async ({ shop, payload, shopifyObjectId: shopifyOrderId }) => {
    const { admin } = await unauthenticated.admin(shop);

    const lineItems = payload.line_items.map(
      (item: { variant_id: number; quantity: number; price: string }) => ({
        shopifyVariantId: `gid://shopify/ProductVariant/${item.variant_id}`,
        quantity: item.quantity,
        price: parseFloat(item.price),
      }),
    );

    const financialStatus = payload.financial_status as string | undefined;
    const orderNumber = payload.name as string | undefined;

    await processOrder({ admin, shopifyOrderId, orderNumber, lineItems, financialStatus });
  },
});
