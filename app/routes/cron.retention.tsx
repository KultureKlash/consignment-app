import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { timingSafeEqual } from "crypto";
import { redactExpiredWebhookPayloads, RAW_PAYLOAD_RETENTION_DAYS } from "~/services/retention";
import { logger } from "~/lib/system";

/**
 * Daily PII retention job. Nulls WebhookEvent.rawPayload past the 90-day window
 * and keeps the row, which is what dedup and audit need.
 *
 * Hit by an external scheduler, so there is no Shopify session to authenticate
 * against — a shared secret guards it instead:
 *
 *   Fly:  fly machine run --schedule=daily --command \
 *           "curl -fsS -X POST -H 'Authorization: Bearer $CRON_SECRET' \
 *            https://konsign.fly.dev/cron/retention"
 *   Or any scheduler that can send that header daily.
 *
 * Returns 404 rather than 401 on a bad secret so the endpoint is not
 * discoverable by probing.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("Authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : header;

  // timingSafeEqual throws on length mismatch, so compare fixed-width digests.
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function run(request: Request) {
  if (!authorized(request)) {
    if (!process.env.CRON_SECRET) {
      logger.warn("Retention job rejected — CRON_SECRET is not set");
    }
    return new Response("Not found", { status: 404 });
  }

  try {
    const { redacted, olderThan } = await redactExpiredWebhookPayloads();
    return Response.json({
      ok: true,
      redactedPayloads: redacted,
      retentionDays: RAW_PAYLOAD_RETENTION_DAYS,
      olderThan: olderThan.toISOString(),
      ts: new Date().toISOString(),
    });
  } catch (error) {
    await logger.error("Retention job failed", { error });
    return Response.json({ ok: false }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  return run(request);
}

// GET as well, so schedulers that can only issue a plain GET still work.
export async function loader({ request }: LoaderFunctionArgs) {
  return run(request);
}
