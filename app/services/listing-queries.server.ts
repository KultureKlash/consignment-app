import prisma from "~/db.server";
import type { Prisma } from "@prisma/client";

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

  // Text search (SQLite-compatible: no mode: "insensitive")
  if (search) {
    const lower = search.toLowerCase();
    const upper = search.toUpperCase();
    conditions.push({
      OR: [
        { consignor: { name: { contains: search } } },
        { consignor: { name: { contains: lower } } },
        { variant: { product: { title: { contains: search } } } },
        { variant: { product: { title: { contains: lower } } } },
        { variant: { product: { styleId: { contains: search } } } },
        { variant: { product: { styleId: { contains: upper } } } },
      ],
    });
  }

  if (status) {
    conditions.push({ status });
  }

  if (category) {
    conditions.push({
      variant: { product: { category: { startsWith: category } } },
    });
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
    // Step 1: Get all matching listings to extract distinct product IDs in order
    const allMatching = await prisma.listing.findMany({
      where,
      orderBy,
      select: { variant: { select: { productId: true } } },
    });

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

    // Step 2: Fetch all listings for those products
    const listings = await prisma.listing.findMany({
      where: { ...where, variant: { productId: { in: pageProductIds } } },
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
