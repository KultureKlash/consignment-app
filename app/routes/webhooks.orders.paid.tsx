import { creditOrder } from "~/services/orders.server";
import { createWebhookHandler } from "~/services/webhooks.server";

export const action = createWebhookHandler({
  idPrefix: "paid",
  handler: async ({ shopifyObjectId }) => {
    await creditOrder({ shopifyOrderId: shopifyObjectId });
  },
});
