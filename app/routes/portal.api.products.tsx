import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticatePortal } from "~/services/portal/auth.server";
import { searchProducts } from "~/services/portal/products.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { portalApiRateLimit } = await import("~/lib/rate-limit.server");
  const limited = portalApiRateLimit(request);
  if (limited) return limited;

  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 200);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const { products, hasMore } = await searchProducts(q, { page });
  return { products, hasMore };
}
