import prisma from "~/db.server";
import { logger } from "~/lib/system";

/**
 * PII retention for WebhookEvent.rawPayload.
 *
 * The payload is exactly what Shopify sent, which for an order includes the
 * customer's name, email, phone and shipping address. The row itself carries no
 * PII — only ids, topic and status — and is what dedup and audit rely on, so
 * retention nulls the payload and keeps the row.
 *
 * Window: 90 days. Long enough to replay a corrupted order and to reconcile a
 * closed quarter; short enough to be a defensible retention period.
 */
export const RAW_PAYLOAD_RETENTION_DAYS = 90;

export type RedactionResult = {
  redacted: number;
  /** The cutoff used, for logging and for the route's response body. */
  olderThan: Date;
};

/**
 * Null rawPayload on rows past the retention window, keeping the rows.
 *
 * Idempotent: filters on `rawPayload: { not: null }`, so repeated runs touch
 * nothing and the reported count is the number actually redacted this run.
 */
export async function redactExpiredWebhookPayloads(
  days: number = RAW_PAYLOAD_RETENTION_DAYS,
): Promise<RedactionResult> {
  const olderThan = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const result = await prisma.webhookEvent.updateMany({
    where: { createdAt: { lt: olderThan }, rawPayload: { not: null } },
    data: { rawPayload: null },
  });

  if (result.count > 0) {
    logger.info("Redacted expired webhook payloads", {
      redacted: result.count,
      retentionDays: days,
      olderThan: olderThan.toISOString(),
    });
  }

  return { redacted: result.count, olderThan };
}

/**
 * Shopify `customers/redact`: erase what we hold about one customer.
 *
 * Targets the orders Shopify names, then sweeps any remaining payload whose
 * embedded customer id matches — a customer can appear on an order that is not
 * in `orders_to_redact` (an order created before the app was installed, say),
 * and the JSON path filter catches those.
 */
export async function redactCustomerWebhookPayloads(input: {
  customerId?: string | number | null;
  orderIds?: Array<string | number>;
}): Promise<{ redacted: number }> {
  let redacted = 0;

  const orderObjectIds = (input.orderIds ?? []).map((id) =>
    String(id).startsWith("gid://") ? String(id) : `gid://shopify/Order/${id}`,
  );

  if (orderObjectIds.length > 0) {
    const byOrder = await prisma.webhookEvent.updateMany({
      where: { shopifyObjectId: { in: orderObjectIds }, rawPayload: { not: null } },
      data: { rawPayload: null },
    });
    redacted += byOrder.count;
  }

  if (input.customerId !== undefined && input.customerId !== null) {
    // Shopify sends the customer id as a number in the payload, so match both
    // shapes rather than assuming which one got serialized.
    for (const candidate of [Number(input.customerId), String(input.customerId)]) {
      if (typeof candidate === "number" && Number.isNaN(candidate)) continue;
      const byCustomer = await prisma.webhookEvent.updateMany({
        where: {
          rawPayload: { path: ["customer", "id"], equals: candidate },
        },
        data: { rawPayload: null },
      });
      redacted += byCustomer.count;
    }
  }

  logger.info("Redacted customer webhook payloads", {
    redacted,
    orders: orderObjectIds.length,
    hadCustomerId: input.customerId !== undefined && input.customerId !== null,
  });

  return { redacted };
}

/**
 * Shopify `shop/redact`: 48 hours after uninstall, erase the shop's data.
 *
 * WebhookEvent has no shop column and this app serves a single store, so every
 * stored payload belongs to the shop being redacted. Scoping by shop would need
 * a schema change; if this ever becomes multi-tenant, add the column and filter
 * here rather than leaving a redaction that quietly over-reaches.
 */
export async function redactShopWebhookPayloads(shop: string): Promise<{ redacted: number }> {
  const result = await prisma.webhookEvent.updateMany({
    where: { rawPayload: { not: null } },
    data: { rawPayload: null },
  });

  logger.info("Redacted shop webhook payloads", { shop, redacted: result.count });

  return { redacted: result.count };
}
