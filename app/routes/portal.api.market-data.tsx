import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import prisma from "~/db.server";
import { authenticatePortal } from "~/services/portal/auth.server";
import { getVariantMarketData } from "~/services/portal/products.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");

  const url = new URL(request.url);
  const variantId = url.searchParams.get("variantId") ?? "";
  if (!variantId) return { lowestPrice: null, daysSinceLastSale: null };

  // Verify the consignor owns at least one listing for this variant
  const owns = await prisma.listing.count({
    where: { consignorId: consignor.id, variantId },
  });
  if (owns === 0) return { lowestPrice: null, daysSinceLastSale: null };

  return getVariantMarketData(variantId);
}
