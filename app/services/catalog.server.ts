import prisma from "~/db.server";

export async function findProductByStyleId(styleId: string) {
  return prisma.product.findUnique({
    where: { styleId },
  });
}

export async function findProductByTitleAndBrand(title: string, brand?: string) {
  // SQLite is case-sensitive, so we search with both original and lowercased
  const titleLower = title.toLowerCase();
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { title, brand: brand ?? null },
        { title: titleLower, brand: brand ?? null },
      ],
    },
    take: 1,
  });
  return products[0] ?? null;
}

export async function createProduct({
  styleId,
  title,
  brand,
  category,
}: {
  styleId?: string | null;
  title: string;
  brand?: string;
  category?: string;
}) {
  return prisma.product.create({
    data: { styleId: styleId || null, title, brand, category },
  });
}

export async function findOrCreateProduct({
  styleId,
  title,
  brand,
  category,
}: {
  styleId?: string | null;
  title: string;
  brand?: string;
  category?: string;
}) {
  // Footwear path: lookup by styleId
  if (styleId) {
    const existing = await findProductByStyleId(styleId);
    if (existing) return existing;
    return createProduct({ styleId, title, brand, category });
  }

  // Non-footwear path: lookup by title + brand
  const existing = await findProductByTitleAndBrand(title, brand);
  if (existing) return existing;
  return createProduct({ styleId: null, title, brand, category });
}

export async function findOrCreateVariant({
  productId,
  size,
  gtin,
}: {
  productId: string;
  size: string;
  gtin?: string;
}) {
  const existing = await prisma.variant.findFirst({
    where: { productId, size },
  });
  if (existing) {
    // Backfill GTIN if it was missing (pre-migration variants)
    if (!existing.gtin && gtin) {
      // Check uniqueness before backfilling
      const duplicate = await prisma.variant.findFirst({ where: { gtin, id: { not: existing.id } } });
      if (duplicate) return existing; // Skip backfill if GTIN already in use
      return prisma.variant.update({
        where: { id: existing.id },
        data: { gtin },
      });
    }
    return existing;
  }
  return prisma.variant.create({
    data: { productId, size, gtin: gtin || null },
  });
}
