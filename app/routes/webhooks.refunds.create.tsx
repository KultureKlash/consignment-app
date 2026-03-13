import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { refundOrder } from "~/services/orders.server";
import { withWebhookDedup } from "~/services/webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? `refund-${payload.id}`;
  const shopifyOrderId = `gid://shopify/Order/${payload.order_id}`;

  const { admin } = await unauthenticated.admin(shop);

  // Extract refund line items from Shopify refund payload
  const refundLineItems = payload.refund_line_items?.map(
    (item: { line_item: { variant_id: number }; quantity: number; restock_type?: string }) => ({
      shopifyVariantId: `gid://shopify/ProductVariant/${item.line_item.variant_id}`,
      quantity: item.quantity,
      restockType: item.restock_type as "return" | "cancel" | "no_restock" | undefined,
    })
  );

  try {
    await withWebhookDedup(webhookId, topic, shopifyOrderId, () =>
      refundOrder({ admin, shopifyOrderId, refundLineItems })
    );
    console.log(`Refund for order ${payload.order_id} processed successfully`);
  } catch (error) {
    console.error(`Refund for order ${payload.order_id} failed:`, error);
  }

  return new Response();
};
