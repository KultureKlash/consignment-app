import prisma from "~/db.server";
import { generateBarcode, parseCategory } from "~/lib/categories";

export async function findProductBySku(sku: string) {
  return prisma.product.findUnique({
    where: { sku },
  });
}

export async function findProductByTitleAndBrand(title: string, brand?: string) {
  return prisma.product.findFirst({
    where: {
      title: { equals: title, mode: "insensitive" },
      brand: brand ? { equals: brand, mode: "insensitive" } : null,
    },
  });
}

export async function createProduct({
  sku,
  title,
  brand,
  category,
}: {
  sku?: string | null;
  title: string;
  brand?: string;
  category?: string;
}) {
  return prisma.product.create({
    data: { sku: sku || null, title, brand, category },
  });
}

export async function findOrCreateProduct({
  sku,
  title,
  brand,
  category,
}: {
  sku?: string | null;
  title: string;
  brand?: string;
  category?: string;
}) {
  // Footwear path: lookup by sku
  if (sku) {
    const existing = await findProductBySku(sku);
    if (existing) return existing;
    return createProduct({ sku, title, brand, category });
  }

  // Non-footwear path: lookup by title + brand
  const existing = await findProductByTitleAndBrand(title, brand);
  if (existing) return existing;
  return createProduct({ sku: null, title, brand, category });
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

/** Auto-generate a unique barcode for a variant that doesn't have one.
 *  Tries up to 3 candidates, throws if all collide (extremely unlikely). */
export async function ensureVariantBarcode(
  variantId: string,
  opts: { brand?: string | null; category?: string | null; size: string },
): Promise<void> {
  const sub = opts.category ? parseCategory(opts.category).sub : undefined;
  let barcode: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = generateBarcode(opts.brand ?? undefined, sub, opts.size);
    const existing = await prisma.variant.findUnique({ where: { gtin: candidate } });
    if (!existing) { barcode = candidate; break; }
  }
  if (!barcode) throw new Error("Failed to generate unique barcode after 3 attempts");
  await prisma.variant.update({ where: { id: variantId }, data: { gtin: barcode } });
}

/** Search products by title, brand, or sku (case-insensitive for SQLite). */
export async function searchProducts(
  query: string,
  opts?: { includeVariants?: boolean; exclude?: string },
) {
  const q = query.trim();
  if (!q) return [];

  return prisma.product.findMany({
    where: {
      ...(opts?.exclude ? { id: { not: opts.exclude } } : {}),
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
      ],
    },
    include: opts?.includeVariants ? { variants: { orderBy: { size: "asc" } } } : undefined,
    take: 10,
    orderBy: { title: "asc" },
  });
}
