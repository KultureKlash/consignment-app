import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { redirect } from "react-router";
import { authenticatePortal } from "~/services/portal/auth.server";
import { getConsignorPayouts } from "~/services/portal/payouts.server";
import prisma from "~/db.server";
import { PayoutsPage } from "~/components/portal/payouts/PayoutsPage";

export async function loader({ request }: LoaderFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");
  const data = await getConsignorPayouts(consignor.id, { storeOwned: consignor.storeOwned });
  return { consignor, ...data };
}

export async function action({ request }: ActionFunctionArgs) {
  const { portalFormRateLimit } = await import("~/lib/rate-limit.server");
  const limited = portalFormRateLimit(request);
  if (limited) return limited;

  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "mark-invoice-sent") {
    const payoutId = formData.get("payoutId") as string;
    // Verify this payout belongs to the consignor
    const payout = await prisma.payout.findFirst({
      where: { id: payoutId, consignorId: consignor.id },
    });
    if (!payout) return { error: "Payout not found" };
    await prisma.payout.update({
      where: { id: payoutId },
      data: { invoiceSent: true },
    });
    return { ok: true };
  }

  return { error: "Invalid intent" };
}

export default function PortalPayouts() {
  const data = useLoaderData<typeof loader>();
  const storeOwned = (data as Record<string, unknown>).storeOwned === true;
  return (
    <PayoutsPage
      consignor={data.consignor}
      payouts={data.payouts}
      unbatchedTxs={data.unbatchedTxs}
      storeOwned={storeOwned}
    />
  );
}
