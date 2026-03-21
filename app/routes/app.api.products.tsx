import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q) return { products: [] };

  // SQLite doesn't support Prisma's mode: "insensitive", so we search
  // with both original and lowercased queries to cover common cases
  const qLower = q.toLowerCase();
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { title: { contains: q } },
        { title: { contains: qLower } },
        { styleId: { contains: q } },
        { styleId: { contains: q.toUpperCase() } },
      ],
    },
    include: { variants: { orderBy: { size: "asc" } } },
    take: 10,
    orderBy: { title: "asc" },
  });

  return { products };
};
