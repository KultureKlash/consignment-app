import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "~/db.server";
import { logger } from "~/lib/logger.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Two windows on WebhookEvent, and they are not the same control:
  //
  //   90 days  — /cron/retention nulls rawPayload. This is the PII mechanism.
  //              The row survives, because dedup and audit need it.
  //  365 days  — this route deletes the row itself. Audit horizon only; by then
  //              the payload has been redacted for nine months.
  //
  // This used to be 30 days, which deleted rows before the 90-day redaction
  // could ever apply to them and threw away the audit trail a year early.
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const [otps, webhooks] = await Promise.all([
    prisma.otpCode.deleteMany({ where: { createdAt: { lt: oneHourAgo } } }),
    prisma.webhookEvent.deleteMany({
      where: { status: { in: ["completed", "failed"] }, createdAt: { lt: oneYearAgo } },
    }),
  ]);

  logger.info("Cleanup complete", { otps: otps.count, webhooks: webhooks.count });

  return Response.json({
    cleaned: { expiredOtps: otps.count, oldWebhookEvents: webhooks.count },
    ts: new Date().toISOString(),
  });
}
