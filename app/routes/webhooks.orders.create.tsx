import { unauthenticated } from "../shopify.server";
import { processOrder } from "~/services/orders";
import { createWebhookHandler } from "~/services/webhooks";

/** Shopify sends money as strings; missing fields mean "not charged". */
function money(value: unknown): number {
  const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : 0;
}

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

    // Recorded for reconciliation only — these never affect what a consignor is
    // credited. Consignors are paid on their listing price and the store absorbs
    // discounts (see CLAUDE.md).
    const shopifyTotals = {
      subtotal: money(payload.subtotal_price),
      discounts: money(payload.total_discounts),
      tax: money(payload.total_tax),
      shipping: money(payload.total_shipping_price_set?.shop_money?.amount),
      total: money(payload.total_price),
    };

    await processOrder({ admin, shopifyOrderId, orderNumber, lineItems, financialStatus, shopifyTotals });
  },
});
