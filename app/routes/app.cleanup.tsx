import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "~/db.server";
import { logger } from "~/lib/logger.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [otps, webhooks] = await Promise.all([
    prisma.otpCode.deleteMany({ where: { createdAt: { lt: oneHourAgo } } }),
    prisma.webhookEvent.deleteMany({
      where: { status: { in: ["completed", "failed"] }, createdAt: { lt: thirtyDaysAgo } },
    }),
  ]);

  logger.info("Cleanup complete", { otps: otps.count, webhooks: webhooks.count });

  return Response.json({
    cleaned: { expiredOtps: otps.count, oldWebhookEvents: webhooks.count },
    ts: new Date().toISOString(),
  });
}
