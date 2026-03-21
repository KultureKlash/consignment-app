import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q) return { brands: [] };

  const qLower = q.toLowerCase();

  // Get distinct brands from DB only — brands grow organically as products are added
  const dbProducts = await prisma.product.groupBy({
    by: ["brand"],
    where: { brand: { not: null } },
  });

  const brands = dbProducts
    .map((p) => p.brand)
    .filter((b): b is string => b !== null)
    .filter((b) => b.toLowerCase().includes(qLower))
    .sort()
    .slice(0, 10);

  return { brands };
};
