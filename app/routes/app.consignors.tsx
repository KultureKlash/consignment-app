import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getConsignorBalance } from "~/services/orders.server";
import { createConsignor } from "~/services/consignors.server";
import prisma from "~/db.server";
import { ConsignorsListPage } from "~/components/admin/consignors/ConsignorsListPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const consignors = await prisma.consignor.findMany({ orderBy: { name: "asc" } });

  const balances: Record<string, number> = {};
  for (const c of consignors) {
    balances[c.id] = await getConsignorBalance(c.id);
  }

  return { consignors, balances };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "create") {
      const { createConsignorSchema, parseForm } = await import("~/lib/validation");
      const data = parseForm(createConsignorSchema, formData);

      await createConsignor({
        name: data.name,
        email: data.email,
        feeRate: data.feeRate / 100,
        taxStatus: data.taxStatus,
        gstNumber: data.gstNumber,
        qstNumber: data.qstNumber,
        province: data.province,
      });
      return { success: true, intent };
    }
    throw new Error("Invalid intent");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message, intent };
  }
};

export default function Consignors() {
  const { consignors, balances } = useLoaderData<typeof loader>();
  return <ConsignorsListPage consignors={consignors} balances={balances} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
