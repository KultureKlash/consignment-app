import { createWebhookHandler } from "~/services/webhooks";
import prisma from "~/db.server";
import { logger } from "~/lib/system";

/**
 * Shopify `customers/data_request` — mandatory privacy-compliance webhook.
 *
 * Shopify requires the app to acknowledge the request and the merchant to
 * deliver the data within 30 days. Nothing can be emailed from here, so this
 * records what the app holds for that customer and logs it for the merchant to
 * fulfil. Acknowledging without recording would leave no way to answer.
 *
 * `storePayload: false` — the payload names the customer, and storing it would
 * add PII while handling a privacy request.
 */
export const action = createWebhookHandler({
  idPrefix: "customers-data-request",
  storePayload: false,
  getObjectId: (payload) => `gid://shopify/Customer/${payload.customer?.id ?? "unknown"}`,
  handler: async ({ payload }) => {
    const orderIds: Array<string | number> = payload.orders_requested ?? [];
    const orderObjectIds = orderIds.map((id) =>
      String(id).startsWith("gid://") ? String(id) : `gid://shopify/Order/${id}`,
    );

    // The only customer data this app holds is inside stored webhook payloads.
    const holding = orderObjectIds.length
      ? await prisma.webhookEvent.count({
          where: { shopifyObjectId: { in: orderObjectIds }, rawPayload: { not: null } },
        })
      : 0;

    logger.info("customers/data_request received — merchant must fulfil within 30 days", {
      ordersRequested: orderIds.length,
      storedPayloadsHeld: holding,
      note: "Customer data lives only in WebhookEvent.rawPayload; no consignor records are storefront customers.",
    });
  },
});
