import prisma from "~/db.server";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

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
      console.log(`Webhook ${shopifyEventId} already processed, skipping`);
      return null;
    }

    // If still "processing", check if it's stale (crash recovery)
    if (existing.status === "processing") {
      const age = Date.now() - existing.createdAt.getTime();
      if (age < STALE_THRESHOLD_MS) {
        console.log(`Webhook ${shopifyEventId} still processing (${Math.round(age / 1000)}s), skipping`);
        return null;
      }
      // Stale — allow retry by deleting the old record
      console.log(`Webhook ${shopifyEventId} stale (${Math.round(age / 1000)}s), retrying`);
      await prisma.webhookEvent.delete({ where: { id: existing.id } });
    }

    // If "failed", allow retry
    if (existing.status === "failed") {
      console.log(`Webhook ${shopifyEventId} previously failed, retrying`);
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
