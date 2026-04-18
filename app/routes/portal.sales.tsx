import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteLoaderData } from "react-router";
import { redirect } from "react-router";
import { SalesPage } from "~/components/portal/sales/SalesPage";
import { authenticatePortal } from "~/services/portal/auth.server";
import { getConsignorSales } from "~/services/portal/sales.server";
import type { loader as portalLoader } from "./portal";

export async function loader({ request }: LoaderFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const status = url.searchParams.get("status") ?? "all";

  const data = await getConsignorSales(consignor.id, {
    search: search || undefined,
    status: status !== "all" ? status : undefined,
  }, { storeOwned: consignor.storeOwned });

  return {
    consignor: { name: consignor.name, taxStatus: consignor.taxStatus, province: consignor.province },
    ...data,
    filters: { search, status },
  };
}

export default function PortalSales() {
  const { consignor, sales, stats, filters, storeOwned } = useLoaderData<typeof loader>();
  const parentData = useRouteLoaderData<typeof portalLoader>("routes/portal");

  return (
    <SalesPage
      consignor={consignor}
      sales={sales}
      stats={stats}
      filters={filters}
      storeOwned={storeOwned}
      avatarColor={parentData?.consignor?.avatarColor}
      notifications={parentData?.notifications}
    />
  );
}
