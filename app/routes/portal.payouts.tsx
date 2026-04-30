import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { redirect } from "react-router";
import { authenticatePortal } from "~/services/portal/auth.server";
import { getConsignorPayouts } from "~/services/portal/payouts.server";
import prisma from "~/db.server";
import { PayoutsPage } from "~/components/portal/payouts/PayoutsPage";
import { buildInvoiceFileName } from "~/lib/invoice-filename";

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

  if (intent === "upload-invoice") {
    const payoutId = formData.get("payoutId") as string;
    const file = formData.get("invoice") as File;
    if (!file || file.size === 0) return { error: "No file selected" };
    if (file.size > 5 * 1024 * 1024) return { error: "File too large (max 5MB)" };

    const buffer = Buffer.from(await file.arrayBuffer());

    // Server-side PDF validation — magic bytes check (client MIME type is spoofable)
    if (buffer.slice(0, 5).toString() !== "%PDF-") return { error: "Only PDF files are accepted" };

    const payout = await prisma.payout.findFirst({
      where: { id: payoutId, consignorId: consignor.id },
      include: {
        items: {
          include: {
            transaction: { include: { orderItem: { include: { order: { select: { orderNumber: true } } } } } },
          },
        },
      },
    });
    if (!payout) return { error: "Payout not found" };

    const base64 = buffer.toString("base64");
    const fileName = buildInvoiceFileName({
      consignorName: consignor.name,
      payoutCreatedAt: payout.createdAt,
      orderNumbers: payout.items
        .map((it) => it.transaction.orderItem?.order.orderNumber)
        .filter((n): n is string => !!n),
    });

    await prisma.payout.update({
      where: { id: payoutId },
      data: { invoiceSent: true, invoiceData: base64, invoiceFileName: fileName },
    });
    return { ok: true };
  }

  if (intent === "delete-invoice") {
    const payoutId = formData.get("payoutId") as string;
    const payout = await prisma.payout.findFirst({
      where: { id: payoutId, consignorId: consignor.id },
      select: { id: true, status: true },
    });
    if (!payout) return { error: "Payout not found" };
    // Block deletion once admin has marked the payout paid — preserves audit trail
    if (payout.status === "paid") return { error: "Cannot delete invoice on a paid payout" };

    await prisma.payout.update({
      where: { id: payoutId },
      data: { invoiceSent: false, invoiceData: null, invoiceFileName: null },
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
