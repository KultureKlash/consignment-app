import { createWebhookHandler } from "~/services/webhooks.server";
import { fulfillOrder } from "~/services/orders.server";

export const action = createWebhookHandler({
  idPrefix: "fulfilled",
  handler: async ({ shopifyObjectId }) => {
    await fulfillOrder({ shopifyOrderId: shopifyObjectId });
  },
});
