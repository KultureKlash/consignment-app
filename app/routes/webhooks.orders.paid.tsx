import { creditOrder } from "~/services/orders";
import { createWebhookHandler } from "~/services/webhooks";

export const action = createWebhookHandler({
  idPrefix: "paid",
  handler: async ({ shopifyObjectId }) => {
    await creditOrder({ shopifyOrderId: shopifyObjectId });
  },
});
