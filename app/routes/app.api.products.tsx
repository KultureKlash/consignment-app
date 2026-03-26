import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);

  // Merge search endpoint (used by product detail page)
  const search = url.searchParams.get("search");
  if (search !== null) {
    const term = search.slice(0, 200).trim();
    const exclude = url.searchParams.get("exclude") ?? "";
    if (!term) return Response.json({ products: [] });

    const lower = term.toLowerCase();
    const products = await prisma.product.findMany({
      where: {
        ...(exclude ? { id: { not: exclude } } : {}),
        OR: [
          { title: { contains: term } },
          { title: { contains: lower } },
          { brand: { contains: term } },
          { brand: { contains: lower } },
          { styleId: { contains: term } },
          { styleId: { contains: lower } },
        ],
      },
      select: {
        id: true,
        title: true,
        brand: true,
        _count: { select: { variants: true } },
      },
      take: 10,
      orderBy: { title: "asc" },
    });

    return Response.json({
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        brand: p.brand,
        variantCount: p._count.variants,
      })),
    });
  }

  // Product finder (used by create listing page)
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
