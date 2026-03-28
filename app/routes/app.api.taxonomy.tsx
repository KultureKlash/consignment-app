import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { searchShopifyTaxonomy } from "~/services/shopify/taxonomy.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q) return { categories: [] };

  const categories = await searchShopifyTaxonomy(admin, q);
  return { categories };
};
