import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteLoaderData } from "react-router";
import { DashboardPage } from "~/components/portal/dashboard/DashboardPage";
import { authenticatePortal } from "~/services/portal/auth.server";
import { getConsignorDashboard } from "~/services/portal/dashboard.server";
import type { loader as portalLoader } from "./portal";

export async function loader({ request }: LoaderFunctionArgs) {
  // Parent portal.tsx layout guards auth — if no session, return null (parent redirects)
  const consignor = await authenticatePortal(request);
  if (!consignor) return null;

  const data = await getConsignorDashboard(consignor.id, { storeOwned: consignor.storeOwned });
  return { ...data };
}

export default function PortalDashboard() {
  const loaderData = useLoaderData<typeof loader>();
  const parentData = useRouteLoaderData<typeof portalLoader>("routes/portal");
  const consignorName = parentData?.consignor.name ?? "";

  // Parent layout handles redirect if not authenticated
  if (!loaderData) return null;

  return (
    <DashboardPage
      data={loaderData}
      consignorName={consignorName}
      avatarColor={parentData?.consignor?.avatarColor}
      notifications={parentData?.notifications}
    />
  );
}
