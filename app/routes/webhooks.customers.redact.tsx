import { createWebhookHandler } from "~/services/webhooks";
import { redactCustomerWebhookPayloads } from "~/services/retention";
import { logger } from "~/lib/system";

/**
 * Shopify `customers/redact` — mandatory privacy-compliance webhook.
 *
 * The only customer PII this app stores is inside WebhookEvent.rawPayload;
 * Consignor rows are marketplace sellers, not storefront customers, and are not
 * in scope for a customer redaction request.
 *
 * `storePayload: false` because this payload names the very customer we are
 * being told to erase — persisting it would manufacture the PII the request
 * exists to remove.
 */
export const action = createWebhookHandler({
  idPrefix: "customers-redact",
  storePayload: false,
  getObjectId: (payload) => `gid://shopify/Customer/${payload.customer?.id ?? "unknown"}`,
  handler: async ({ payload }) => {
    const { redacted } = await redactCustomerWebhookPayloads({
      customerId: payload.customer?.id ?? null,
      orderIds: payload.orders_to_redact ?? [],
    });

    // No customer identifiers in this log line — only counts.
    logger.info("customers/redact handled", {
      redactedPayloads: redacted,
      orderCount: (payload.orders_to_redact ?? []).length,
    });
  },
});
