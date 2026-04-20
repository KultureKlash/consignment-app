import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "~/db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  const id = params.id!;

  const payout = await prisma.payout.findUnique({
    where: { id },
    select: { invoiceData: true, invoiceFileName: true },
  });

  if (!payout?.invoiceData) {
    return new Response("Invoice not found", { status: 404 });
  }

  const buffer = Buffer.from(payout.invoiceData, "base64");
  const fileName = payout.invoiceFileName ?? "invoice.pdf";

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
