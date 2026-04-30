import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "~/db.server";
import { LISTING_STATUS } from "~/lib/domain";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const shopifyProductId = url.searchParams.get("id"); // gid://shopify/Product/12345
  if (!shopifyProductId) return { error: "Missing product id" };

  const product = await prisma.product.findUnique({
    where: { shopifyProductId },
    include: {
      variants: {
        include: {
          listings: {
            where: { status: { in: [LISTING_STATUS.ACTIVE, LISTING_STATUS.PENDING_SALE, LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.AWAITING_PRICE, LISTING_STATUS.WITHDRAWAL_REQUESTED, LISTING_STATUS.PENDING_PICKUP] } },
            include: { consignor: { select: { id: true, name: true } } },
            orderBy: [{ price: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });

  if (!product) return { found: false };

  // Aggregate by variant
  const variants = product.variants.map((v) => {
    const active = v.listings.filter((l) => l.status === LISTING_STATUS.ACTIVE);
    const lowestActive = active[0];
    const needsPrice = v.listings.filter((l) => l.status === LISTING_STATUS.AWAITING_PRICE).length;
    return {
      variantId: v.id,
      size: v.size,
      activeCount: active.length,
      lowestPrice: lowestActive?.price ?? null,
      lowestOwner: lowestActive?.consignor.name ?? null,
      needsPrice,
    };
  }).filter((v) => v.activeCount > 0 || v.needsPrice > 0);

  // Top-line stats
  const allActive = product.variants.flatMap((v) => v.listings.filter((l) => l.status === LISTING_STATUS.ACTIVE));
  const totalActive = allActive.length;
  const lowest = allActive[0]
    ? { price: allActive[0].price, owner: allActive[0].consignor.name }
    : null;

  // Action items across all variants
  const allListings = product.variants.flatMap((v) => v.listings);
  const actions = {
    awaitingPrice: allListings.filter((l) => l.status === LISTING_STATUS.AWAITING_PRICE).length,
    submitted: allListings.filter((l) => l.status === LISTING_STATUS.SUBMITTED).length,
    awaitingDropoff: allListings.filter((l) => l.status === LISTING_STATUS.APPROVED).length,
    withdrawalRequested: allListings.filter((l) => l.status === LISTING_STATUS.WITHDRAWAL_REQUESTED).length,
    pendingPickup: allListings.filter((l) => l.status === LISTING_STATUS.PENDING_PICKUP).length,
  };

  return {
    found: true,
    product: { id: product.id, title: product.title },
    totalActive,
    lowest,
    variants,
    actions,
  };
};
