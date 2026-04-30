import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "~/db.server";
import { LISTING_STATUS } from "~/lib/domain";
import { logger } from "~/lib/system";

export type ProductSummary = {
  totalActive: number;
  lowest: { price: number; owner: string } | null;
  variants: Array<{
    variantId: string;
    size: string;
    activeCount: number;
    lowestPrice: number | null;
    lowestOwner: string | null;
    needsPrice: number;
  }>;
  actions: {
    awaitingPrice: number;
    submitted: number;
    awaitingDropoff: number;
    withdrawalRequested: number;
    pendingPickup: number;
  };
  product: { title: string };
  updatedAt: string;
};

export async function buildProductSummary(productId: string): Promise<ProductSummary | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: {
        include: {
          listings: {
            where: {
              status: {
                in: [
                  LISTING_STATUS.ACTIVE,
                  LISTING_STATUS.PENDING_SALE,
                  LISTING_STATUS.SUBMITTED,
                  LISTING_STATUS.APPROVED,
                  LISTING_STATUS.AWAITING_PRICE,
                  LISTING_STATUS.WITHDRAWAL_REQUESTED,
                  LISTING_STATUS.PENDING_PICKUP,
                ],
              },
            },
            include: { consignor: { select: { name: true } } },
            orderBy: [{ price: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });
  if (!product) return null;

  const variants = product.variants
    .map((v) => {
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
    })
    .filter((v) => v.activeCount > 0 || v.needsPrice > 0);

  const allActive = product.variants.flatMap((v) =>
    v.listings.filter((l) => l.status === LISTING_STATUS.ACTIVE),
  );
  const totalActive = allActive.length;
  const lowestActive = allActive[0];
  const lowest =
    lowestActive && lowestActive.price != null
      ? { price: lowestActive.price, owner: lowestActive.consignor.name }
      : null;

  const allListings = product.variants.flatMap((v) => v.listings);
  const actions = {
    awaitingPrice: allListings.filter((l) => l.status === LISTING_STATUS.AWAITING_PRICE).length,
    submitted: allListings.filter((l) => l.status === LISTING_STATUS.SUBMITTED).length,
    awaitingDropoff: allListings.filter((l) => l.status === LISTING_STATUS.APPROVED).length,
    withdrawalRequested: allListings.filter((l) => l.status === LISTING_STATUS.WITHDRAWAL_REQUESTED).length,
    pendingPickup: allListings.filter((l) => l.status === LISTING_STATUS.PENDING_PICKUP).length,
  };

  return {
    totalActive,
    lowest,
    variants,
    actions,
    product: { title: product.title },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Writes the Konsign summary as a JSON metafield on the Shopify product.
 * Read by the admin block extension via shopify.query — no backend fetch needed.
 *
 * Best-effort: errors logged, never thrown.
 */
export async function syncProductSummaryMetafield({
  admin,
  productId,
}: {
  admin: AdminApiContext;
  productId: string;
}): Promise<void> {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { shopifyProductId: true },
    });
    if (!product?.shopifyProductId) return; // not synced to Shopify yet

    const summary = await buildProductSummary(productId);
    if (!summary) return;

    const response = await admin.graphql(
      `#graphql
      mutation setSummary($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          metafields: [
            {
              ownerId: product.shopifyProductId,
              namespace: "konsign",
              key: "summary",
              type: "json",
              value: JSON.stringify(summary),
            },
          ],
        },
      },
    );
    const { data } = await response.json();
    const errors = data?.metafieldsSet?.userErrors ?? [];
    if (errors.length > 0) {
      logger.error("Failed to write konsign.summary metafield", {
        productId,
        errors,
      });
    }
  } catch (err) {
    logger.error("syncProductSummaryMetafield crashed", {
      productId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
