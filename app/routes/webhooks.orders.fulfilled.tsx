import { createWebhookHandler } from "~/services/webhooks";
import { fulfillOrder } from "~/services/orders";

export const action = createWebhookHandler({
  idPrefix: "fulfilled",
  handler: async ({ shopifyObjectId }) => {
    await fulfillOrder({ shopifyOrderId: shopifyObjectId });
  },
});
