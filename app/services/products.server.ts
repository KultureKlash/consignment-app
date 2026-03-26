import prisma from "~/db.server";
import { parseCategory } from "~/lib/categories";

// ── Types ────────────────────────────────────────────────

export type ProductFilters = {
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
};

// ── Query Products (list page) ───────────────────────────

export async function queryProducts(filters: ProductFilters = {}) {
  const { search, category, page = 1, limit = 25 } = filters;
  const skip = (page - 1) * limit;

  const where: any = {};

  // Search across title, brand, styleId (SQLite case-sensitive workaround)
  if (search) {
    const term = search.trim();
    const lower = term.toLowerCase();
    where.OR = [
      { title: { contains: term } },
      { title: { contains: lower } },
      { brand: { contains: term } },
      { brand: { contains: lower } },
      { styleId: { contains: term } },
      { styleId: { contains: lower } },
    ];
  }

  // Category filter — supports main category or "Main > Sub"
  if (category) {
    where.category = { startsWith: category };
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        variants: {
          select: {
            id: true,
            size: true,
            gtin: true,
            shopifyVariantId: true,
            _count: { select: { listings: { where: { status: "active" } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products: products.map((p) => ({
      ...p,
      variantCount: p.variants.length,
      activeListings: p.variants.reduce((sum, v) => sum + v._count.listings, 0),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ── Get Product Detail ───────────────────────────────────

export async function getProductDetail(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: {
        include: {
          _count: {
            select: {
              listings: { where: { status: "active" } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!product) throw new Error("Product not found");

  return {
    ...product,
    variants: product.variants.map((v) => ({
      ...v,
      activeListings: v._count.listings,
    })),
  };
}

// ── Update Product ───────────────────────────────────────

export async function updateProduct(
  id: string,
  data: { title?: string; brand?: string; category?: string; styleId?: string | null; imageUrl?: string },
) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new Error("Product not found");

  // Validate styleId uniqueness if changing
  if (data.styleId !== undefined && data.styleId !== product.styleId && data.styleId !== null) {
    const existing = await prisma.product.findUnique({ where: { styleId: data.styleId } });
    if (existing && existing.id !== id) {
      throw new Error("Style ID already in use by another product");
    }
  }

  return prisma.product.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.brand !== undefined ? { brand: data.brand } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.styleId !== undefined ? { styleId: data.styleId || null } : {}),
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
    },
  });
}

// ── Update Variant GTIN ──────────────────────────────────

export async function updateVariantGtin(variantId: string, gtin: string | null) {
  const variant = await prisma.variant.findUnique({ where: { id: variantId } });
  if (!variant) throw new Error("Variant not found");

  // Validate GTIN uniqueness if setting a value
  if (gtin) {
    const existing = await prisma.variant.findFirst({
      where: { gtin, id: { not: variantId } },
    });
    if (existing) throw new Error("GTIN already in use by another variant");
  }

  return prisma.variant.update({
    where: { id: variantId },
    data: { gtin: gtin || null },
  });
}

// ── Merge Products ───────────────────────────────────────

export async function mergeProducts(targetId: string, sourceId: string, { force = false } = {}) {
  if (targetId === sourceId) throw new Error("Cannot merge a product into itself");

  const [target, source] = await Promise.all([
    prisma.product.findUnique({ where: { id: targetId }, include: { variants: true } }),
    prisma.product.findUnique({ where: { id: sourceId }, include: { variants: { include: { listings: { select: { id: true } } } } } }),
  ]);
  if (!target) throw new Error("Target product not found");
  if (!source) throw new Error("Source product not found");

  // Block cross-category merges (e.g. Footwear into Headwear)
  const targetMain = target.category ? parseCategory(target.category).main : "";
  const sourceMain = source.category ? parseCategory(source.category).main : "";
  if (targetMain && sourceMain && targetMain !== sourceMain) {
    throw new Error(`Cannot merge across categories: "${sourceMain}" into "${targetMain}"`);
  }

  // Warn on brand mismatch (require force flag to proceed)
  const targetBrand = (target.brand ?? "").toLowerCase().trim();
  const sourceBrand = (source.brand ?? "").toLowerCase().trim();
  if (targetBrand && sourceBrand && targetBrand !== sourceBrand && !force) {
    throw new Error(`Brand mismatch: "${source.brand}" → "${target.brand}". Confirm to proceed.`);
  }

  // Build a map of target variants by size for overlap detection
  const targetSizeMap = new Map(target.variants.map((v) => [v.size, v.id]));

  // Run the entire merge inside a transaction so it's all-or-nothing
  const affectedVariantIds = await prisma.$transaction(async (tx) => {
    const affected: string[] = [];

    for (const sourceVariant of source.variants) {
      const targetVariantId = targetSizeMap.get(sourceVariant.size);

      if (targetVariantId) {
        // Size exists on target — move all listings from source variant to target variant
        await tx.listing.updateMany({
          where: { variantId: sourceVariant.id },
          data: { variantId: targetVariantId },
        });
        // Delete source variant (now empty — listings already moved)
        await tx.variant.delete({ where: { id: sourceVariant.id } });
        affected.push(targetVariantId);
      } else {
        // Size doesn't exist on target — re-parent the variant
        // Clear shopifyVariantId to avoid conflicts (will be re-created on next sync)
        await tx.variant.update({
          where: { id: sourceVariant.id },
          data: { productId: targetId, shopifyVariantId: null, inventoryItemId: null },
        });
        affected.push(sourceVariant.id);
      }
    }

    // Clear source Shopify ID before deleting (the Shopify product is now orphaned)
    if (source.shopifyProductId) {
      await tx.product.update({
        where: { id: sourceId },
        data: { shopifyProductId: null },
      });
    }

    // Delete source product (now has no variants)
    await tx.product.delete({ where: { id: sourceId } });

    return affected;
  });

  // Return fresh target with updated data
  return {
    product: await getProductDetail(targetId),
    affectedVariantIds,
    deletedProductId: sourceId,
    // Caller should clean up source's Shopify product if it existed
    deletedShopifyProductId: source.shopifyProductId ?? null,
  };
}
