import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { creditOrder } from "~/services/orders.server";
import { withWebhookDedup } from "~/services/webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? `paid-${payload.id}`;
  const shopifyOrderId = `gid://shopify/Order/${payload.id}`;

  try {
    await withWebhookDedup(webhookId, topic, shopifyOrderId, () =>
      creditOrder({ shopifyOrderId })
    );
    console.log(`Order ${payload.id} credited successfully`);
  } catch (error) {
    console.error(`Order ${payload.id} credit failed:`, error);
  }

  return new Response();
};
