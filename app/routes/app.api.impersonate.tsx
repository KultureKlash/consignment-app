import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { createImpersonationToken } from "~/services/portal/auth.server";
import prisma from "~/db.server";

/**
 * Admin-only: generate a short-lived impersonation token for a consignor.
 * Returns { url } that the admin opens in a new tab.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const consignorId = formData.get("consignorId") as string;
  if (!consignorId) return Response.json({ error: "Missing consignorId" }, { status: 400 });

  const consignor = await prisma.consignor.findUnique({ where: { id: consignorId } });
  if (!consignor) return Response.json({ error: "Consignor not found" }, { status: 404 });

  const token = createImpersonationToken(consignor.id);

  // Build the portal URL — use the request origin for the base
  const origin = new URL(request.url).origin;
  const url = `${origin}/portal/impersonate?token=${encodeURIComponent(token)}`;

  return Response.json({ url });
};
