import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q) return { brands: [] };

  const products = await prisma.product.findMany({
    where: { brand: { contains: q, mode: "insensitive" } },
    select: { brand: true },
    distinct: ["brand"],
    take: 10,
    orderBy: { brand: "asc" },
  });

  return { brands: products.map((p) => p.brand).filter(Boolean) };
};
