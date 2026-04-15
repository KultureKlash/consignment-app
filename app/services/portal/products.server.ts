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

export async function searchProducts(query: string): Promise<PortalProductResult[]> {
  const products = await searchProductsBase(query, { includeVariants: true });

  return products.map((p) => ({
    id: p.id,
    sku: p.sku,
    title: p.title,
    brand: p.brand,
    category: p.category,
    imageUrl: p.imageUrl && !p.imageUrl.startsWith("data:") ? p.imageUrl : null,
    variants: (p.variants ?? []).map((v) => ({ id: v.id, size: v.size, gtin: v.gtin })),
  }));
}

export async function getVariantMarketData(variantId: string) {
  // Lowest active price for this variant
  const lowestListing = await prisma.listing.findFirst({
    where: { variantId, status: LISTING_STATUS.ACTIVE },
    orderBy: { price: "asc" },
    select: { price: true },
  });

  // Most recent listing for this variant (any status)
  const lastListing = await prisma.listing.findFirst({
    where: { variantId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  let daysSinceLastListing: number | null = null;
  if (lastListing) {
    const diffMs = Date.now() - new Date(lastListing.createdAt).getTime();
    daysSinceLastListing = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  return {
    lowestPrice: lowestListing?.price ?? null,
    daysSinceLastListing,
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
