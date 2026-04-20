import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { searchProducts } from "~/services/catalog";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);

  // Merge search endpoint (used by product detail page)
  const search = url.searchParams.get("search");
  if (search !== null) {
    const term = search.slice(0, 200).trim();
    const exclude = url.searchParams.get("exclude") ?? "";
    if (!term) return Response.json({ products: [] });

    const products = await searchProducts(term, { includeVariants: true, exclude: exclude || undefined });
    return Response.json({
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        brand: p.brand,
        variantCount: p.variants?.length ?? 0,
      })),
    });
  }

  // Product finder (used by create listing page)
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return { products: [] };

  const products = await searchProducts(q, { includeVariants: true });
  return { products };
};
