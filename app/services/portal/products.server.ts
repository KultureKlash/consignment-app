import prisma from "~/db.server";
import { searchProducts as searchProductsBase } from "~/services/catalog.server";
import { LISTING_STATUS } from "~/lib/listing-statuses";

export type PortalProductResult = {
  id: string;
  sku: string | null;
  title: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  variants: Array<{ id: string; size: string; gtin: string | null }>;
};

export async function searchProducts(
  query: string,
  opts: { page?: number; limit?: number } = {},
): Promise<{ products: PortalProductResult[]; hasMore: boolean }> {
  const q = query.trim();
  if (!q) return { products: [], hasMore: false };

  const page = opts.page ?? 1;
  const limit = opts.limit ?? 15;

  // Split query into words — ALL words must match somewhere in title, brand, or sku
  const words = q.split(/\s+/).filter(Boolean);
  const wordFilters = words.map((word) => ({
    OR: [
      { title: { contains: word, mode: "insensitive" as const } },
      { brand: { contains: word, mode: "insensitive" as const } },
      { sku: { contains: word, mode: "insensitive" as const } },
    ],
  }));

  // Fetch more than needed so we can sort by relevance in JS
  const fetchLimit = limit * 4;
  const allProducts = await prisma.product.findMany({
    where: { AND: wordFilters },
    include: { variants: { orderBy: { size: "asc" } } },
    orderBy: { variants: { _count: "desc" } },
    take: fetchLimit,
  });

  // Sort by relevance: starts-with > whole-word > substring
  const lowerWords = words.map((w) => w.toLowerCase());
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startsWithPatterns = lowerWords.map((w) => new RegExp(`\\b${escape(w)}`, "i"));
  const wholeWordPatterns = lowerWords.map((w) => new RegExp(`\\b${escape(w)}\\b`, "i"));

  const scored = allProducts.map((p) => {
    const title = p.title;
    // Words in title that START with the search term (e.g. "ni" → "Nike" matches)
    const startsWithMatches = startsWithPatterns.filter((re) => re.test(title)).length;
    // Exact whole-word matches (e.g. "4" matches "4" but not "2024")
    const wholeWordMatches = wholeWordPatterns.filter((re) => re.test(title)).length;
    const substringMatches = lowerWords.filter((w) => title.toLowerCase().includes(w)).length;
    // starts-with 100x > whole-word 10x > substring 1x
    const score = startsWithMatches * 100 + wholeWordMatches * 10 + substringMatches;
    return { product: p, score };
  });
  scored.sort((a, b) => b.score - a.score || b.product.variants.length - a.product.variants.length);

  const sorted = scored.map((s) => s.product);
  const page_products = sorted.slice((page - 1) * limit, page * limit);
  const hasMore = sorted.length > page * limit;

  return {
    products: page_products.map((p) => ({
      id: p.id,
      sku: p.sku,
      title: p.title,
      brand: p.brand,
      category: p.category,
      imageUrl: p.imageUrl && !p.imageUrl.startsWith("data:") ? p.imageUrl : null,
      variants: p.variants.map((v) => ({ id: v.id, size: v.size, gtin: v.gtin })),
    })),
    hasMore,
  };
}

export async function getVariantMarketData(variantId: string) {
  // Lowest active price for this variant
  const lowestListing = await prisma.listing.findFirst({
    where: { variantId, status: LISTING_STATUS.ACTIVE },
    orderBy: { price: "asc" },
    select: { price: true },
  });

  // Most recent sale for this variant
  const lastSold = await prisma.listing.findFirst({
    where: { variantId, status: LISTING_STATUS.SOLD, soldAt: { not: null } },
    orderBy: { soldAt: "desc" },
    select: { soldAt: true },
  });

  let daysSinceLastSale: number | null = null;
  if (lastSold?.soldAt) {
    const diffMs = Date.now() - new Date(lastSold.soldAt).getTime();
    daysSinceLastSale = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  return {
    lowestPrice: lowestListing?.price ?? null,
    daysSinceLastSale,
  };
}

export async function searchBrands(query: string): Promise<string[]> {
  if (!query.trim()) return [];

  const products = await prisma.product.findMany({
    where: { brand: { contains: query.trim(), mode: "insensitive" } },
    select: { brand: true },
    distinct: ["brand"],
    take: 10,
    orderBy: { brand: "asc" },
  });

  return products.map((p) => p.brand!);
}
