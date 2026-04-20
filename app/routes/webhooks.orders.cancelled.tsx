import { unauthenticated } from "../shopify.server";
import { cancelOrder } from "~/services/orders";
import { createWebhookHandler } from "~/services/webhooks";

export const action = createWebhookHandler({
  idPrefix: "cancel",
  handler: async ({ shop, shopifyObjectId }) => {
    const { admin } = await unauthenticated.admin(shop);
    await cancelOrder({ admin, shopifyOrderId: shopifyObjectId });
  },
});
