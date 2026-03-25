import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticatePortal } from "~/services/portal-auth.server";
import { searchBrands } from "~/services/portal-products.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const brands = await searchBrands(q);
  return { brands };
}
