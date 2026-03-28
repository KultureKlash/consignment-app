import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import prisma from "~/db.server";
import { authenticatePortal } from "~/services/portal/auth.server";

export async function action({ request }: ActionFunctionArgs) {
  const { portalApiRateLimit } = await import("~/lib/rate-limit.server");
  const limited = portalApiRateLimit(request);
  if (limited) return limited;

  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");

  try {
    await prisma.consignor.update({
      where: { id: consignor.id },
      data: { notificationsReadAt: new Date() },
    });
    return { ok: true };
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
