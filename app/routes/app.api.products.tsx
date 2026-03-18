import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q) return { products: [] };

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { title: { contains: q } },
        { styleId: { contains: q } },
      ],
    },
    include: { variants: { orderBy: { size: "asc" } } },
    take: 10,
    orderBy: { title: "asc" },
  });

  return { products };
};
