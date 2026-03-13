import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { cancelOrder } from "~/services/orders.server";
import { withWebhookDedup } from "~/services/webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? `cancel-${payload.id}`;
  const shopifyOrderId = `gid://shopify/Order/${payload.id}`;

  const { admin } = await unauthenticated.admin(shop);

  const financialStatus = payload.financial_status as string | undefined;

  try {
    await withWebhookDedup(webhookId, topic, shopifyOrderId, () =>
      cancelOrder({ admin, shopifyOrderId, financialStatus })
    );
    console.log(`Order ${payload.id} cancelled successfully`);
  } catch (error) {
    console.error(`Order ${payload.id} cancellation failed:`, error);
  }

  return new Response();
};
