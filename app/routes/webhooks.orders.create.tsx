import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { processOrder } from "~/services/orders.server";
import { withWebhookDedup } from "~/services/webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? `order-${payload.id}`;
  const shopifyOrderId = `gid://shopify/Order/${payload.id}`;

  // Get an admin client for this shop (webhooks don't have session-based admin)
  const { admin } = await unauthenticated.admin(shop);

  // Shopify webhook sends REST-format numeric IDs; convert to GID format
  const lineItems = payload.line_items.map(
    (item: { variant_id: number; quantity: number; price: string }) => ({
      shopifyVariantId: `gid://shopify/ProductVariant/${item.variant_id}`,
      quantity: item.quantity,
      price: parseFloat(item.price),
    })
  );

  const financialStatus = payload.financial_status as string | undefined;

  try {
    await withWebhookDedup(webhookId, topic, shopifyOrderId, () =>
      processOrder({ admin, shopifyOrderId, lineItems, financialStatus })
    );
    console.log(`Order ${payload.id} processed successfully`);
  } catch (error) {
    // Log but don't throw — return 200 so Shopify doesn't keep retrying
    console.error(`Order ${payload.id} processing failed:`, error);
  }

  return new Response();
};
