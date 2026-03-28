import prisma from "~/db.server";

export type PortalProductResult = {
  id: string;
  styleId: string | null;
  title: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  variants: Array<{ id: string; size: string; gtin: string | null }>;
};

export async function searchProducts(query: string): Promise<PortalProductResult[]> {
  if (!query.trim()) return [];

  const q = query.trim();
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

  return products.map((p) => ({
    id: p.id,
    styleId: p.styleId,
    title: p.title,
    brand: p.brand,
    category: p.category,
    imageUrl: p.imageUrl && !p.imageUrl.startsWith("data:") ? p.imageUrl : null,
    variants: p.variants.map((v) => ({ id: v.id, size: v.size, gtin: v.gtin })),
  }));
}

export async function getVariantMarketData(variantId: string) {
  // Lowest active price for this variant
  const lowestListing = await prisma.listing.findFirst({
    where: { variantId, status: "active" },
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

  const q = query.trim().toLowerCase();
  const products = await prisma.product.findMany({
    where: { brand: { not: null } },
    select: { brand: true },
    distinct: ["brand"],
  });

  return products
    .map((p) => p.brand!)
    .filter((b) => b.toLowerCase().includes(q))
    .sort()
    .slice(0, 10);
}
