import type { ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { logger } from "~/lib/system";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ── Webhook handler factory ──────────────────────────────────────────
// DRYs up the 4 order/refund webhook routes that share the same
// authenticate → dedup → handle → log → return 200 pattern.

interface WebhookHandlerOptions {
  /** Prefix for the fallback webhook ID (e.g. "order", "paid", "refund") */
  idPrefix: string;
  /**
   * Extract the Shopify object GID used for dedup grouping.
   * Defaults to `gid://shopify/Order/${payload.id}`.
   */
  getObjectId?: (payload: Record<string, any>) => string;
  /** The actual business logic. Receives everything it might need. */
  handler: (ctx: {
    shop: string;
    payload: Record<string, any>;
    shopifyObjectId: string;
    request: Request;
  }) => Promise<void>;
}

/**
 * Creates a Remix `action` for a Shopify webhook route.
 * Handles authentication, dedup, success/error logging, and always returns 200.
 */
export function createWebhookHandler(opts: WebhookHandlerOptions) {
  return async ({ request }: ActionFunctionArgs) => {
    const { authenticate } = await import("~/shopify.server");
    const { shop, topic, payload } = await authenticate.webhook(request);

    logger.info("Webhook received", { topic, shop });

    const webhookId =
      request.headers.get("X-Shopify-Webhook-Id") ??
      `${opts.idPrefix}-${payload.id}`;

    const shopifyObjectId = opts.getObjectId
      ? opts.getObjectId(payload)
      : `gid://shopify/Order/${payload.id}`;

    try {
      await withWebhookDedup(webhookId, topic, shopifyObjectId, () =>
        opts.handler({ shop, payload, shopifyObjectId, request }),
      );
      logger.info("Webhook processed", { topic, shopifyObjectId });
    } catch (error) {
      logger.error("Webhook processing failed", { topic, shopifyObjectId, error: error instanceof Error ? error.message : String(error) });
    }

    return new Response();
  };
}

/**
 * Webhook deduplication wrapper. Ensures each Shopify webhook event
 * is processed exactly once, even if Shopify retries delivery.
 *
 * Returns the handler result, or null if the event was already processed.
 */
export async function withWebhookDedup<T>(
  shopifyEventId: string,
  topic: string,
  shopifyObjectId: string,
  handler: () => Promise<T>,
): Promise<T | null> {
  // Check for existing event
  const existing = await prisma.webhookEvent.findUnique({
    where: { shopifyEventId },
  });

  if (existing) {
    if (existing.status === "completed") {
      logger.info("Webhook already processed, skipping", { shopifyEventId });
      return null;
    }

    // If still "processing", check if it's stale (crash recovery)
    if (existing.status === "processing") {
      const age = Date.now() - existing.createdAt.getTime();
      if (age < STALE_THRESHOLD_MS) {
        logger.info("Webhook still processing, skipping", { shopifyEventId, ageSeconds: Math.round(age / 1000) });
        return null;
      }
      // Stale — allow retry by deleting the old record
      logger.info("Webhook stale, retrying", { shopifyEventId, ageSeconds: Math.round(age / 1000) });
      await prisma.webhookEvent.delete({ where: { id: existing.id } });
    }

    // If "failed", allow retry
    if (existing.status === "failed") {
      logger.info("Webhook previously failed, retrying", { shopifyEventId });
      await prisma.webhookEvent.delete({ where: { id: existing.id } });
    }
  }

  // Create the event record as "processing"
  const event = await prisma.webhookEvent.create({
    data: {
      shopifyEventId,
      topic,
      shopifyObjectId,
      status: "processing",
    },
  });

  try {
    const result = await handler();

    // Mark as completed
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: "completed", processedAt: new Date() },
    });

    return result;
  } catch (error) {
    // Mark as failed with error message
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: "failed", error: errorMessage },
    });

    throw error;
  }
}
