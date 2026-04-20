import prisma from "~/db.server";
import type { Prisma } from "@prisma/client";
import { CATEGORIES } from "~/lib/categories";
import { logger } from "~/lib/system";

export type ListingFilters = {
  search?: string;
  status?: string;
  category?: string;
  consignorId?: string;
  sectionId?: string;
  sortBy?: "date" | "price" | "status";
  sortDir?: "asc" | "desc";
  page?: number;
  limit?: number;
  grouped?: boolean;
};

const LISTING_INCLUDE = {
  consignor: true,
  variant: { include: { product: { include: { section: true } } } },
} as const;

export async function queryListings(filters: ListingFilters) {
  const {
    search,
    status,
    category,
    consignorId,
    sortBy = "date",
    sortDir = "desc",
    page = 1,
    limit = 25,
  } = filters;

  const conditions: Prisma.ListingWhereInput[] = [];

  if (search) {
    conditions.push({
      OR: [
        { consignor: { name: { contains: search, mode: "insensitive" } } },
        { variant: { product: { title: { contains: search, mode: "insensitive" } } } },
        { variant: { product: { sku: { contains: search, mode: "insensitive" } } } },
      ],
    });
  }

  if (status) {
    conditions.push({ status });
  }

  if (category) {
    const subcats = CATEGORIES[category];
    if (subcats) {
      // Main category selected — match any subcategory or the main name itself (legacy data)
      conditions.push({ variant: { product: { category: { in: [category, ...subcats] } } } });
    } else {
      conditions.push({ variant: { product: { category } } });
    }
  }

  if (consignorId) {
    conditions.push({ consignorId });
  }

  if (filters.sectionId) {
    conditions.push({ variant: { product: { sectionId: filters.sectionId } } });
  }

  const where: Prisma.ListingWhereInput = conditions.length > 0 ? { AND: conditions } : {};

  // Sort mapping
  const orderBy: Prisma.ListingOrderByWithRelationInput =
    sortBy === "price" ? { price: sortDir }
    : sortBy === "status" ? { status: sortDir }
    : { createdAt: sortDir };

  // Grouped mode: paginate by product groups, not individual listings
  if (filters.grouped) {
    // Step 1: Get distinct product IDs (lightweight select — only IDs, not full objects)
    // Trigger: if consistently > 200ms or listings > 100K, switch to PostgreSQL DISTINCT ON
    const start = Date.now();
    const allMatching = await prisma.listing.findMany({
      where,
      orderBy,
      select: { variant: { select: { productId: true } } },
    });
    const ms = Date.now() - start;
    if (ms > 200) logger.warn("Slow grouped listing query", { ms, matchCount: allMatching.length });

    // Deduplicate product IDs preserving sort order
    const seen = new Set<string>();
    const productIds: string[] = [];
    for (const l of allMatching) {
      if (!seen.has(l.variant.productId)) {
        seen.add(l.variant.productId);
        productIds.push(l.variant.productId);
      }
    }

    const totalGroups = productIds.length;
    const pageProductIds = productIds.slice((page - 1) * limit, page * limit);

    // Step 2: Fetch all listings for those products (AND-compose to avoid nested variant merge)
    const listings = await prisma.listing.findMany({
      where: { AND: [where, { variant: { productId: { in: pageProductIds } } }] },
      orderBy,
      include: LISTING_INCLUDE,
    });

    return {
      listings,
      total: totalGroups,
      page,
      limit,
      totalPages: Math.ceil(totalGroups / limit),
    };
  }

  // Flat mode: paginate by individual listings
  const skip = (page - 1) * limit;

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: LISTING_INCLUDE,
    }),
    prisma.listing.count({ where }),
  ]);

  return {
    listings,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
