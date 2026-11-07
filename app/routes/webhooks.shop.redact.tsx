import { createWebhookHandler } from "~/services/webhooks";
import { redactShopWebhookPayloads } from "~/services/retention";
import { logger } from "~/lib/system";

/**
 * Shopify `shop/redact` — mandatory privacy-compliance webhook, delivered 48
 * hours after the app is uninstalled.
 *
 * Redacts every stored webhook payload. Scope note: this clears customer PII
 * only. The merchant's own marketplace data — consignors, listings, orders,
 * transactions, payouts — is deliberately left in place, because it is the
 * store's financial record and deleting it on uninstall would destroy payout
 * history the merchant may still owe against. Erasing that is a business
 * decision with accounting consequences, not something a webhook should do
 * silently.
 */
export const action = createWebhookHandler({
  idPrefix: "shop-redact",
  storePayload: false,
  getObjectId: (payload) => `gid://shopify/Shop/${payload.shop_id ?? payload.shop_domain ?? "unknown"}`,
  handler: async ({ shop, payload }) => {
    const { redacted } = await redactShopWebhookPayloads(
      (payload.shop_domain as string) ?? shop,
    );

    logger.info("shop/redact handled", {
      shop,
      redactedPayloads: redacted,
      note: "Customer PII cleared. Merchant marketplace and financial records retained by design.",
    });
  },
});
