import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { ensureShopifyProductAndVariant } from "~/services/shopify/products.server";
import { syncInventory } from "~/services/inventory.server";
import { generateBarcode, parseCategory } from "~/lib/categories";

// ── Admin: Activate listing (check-in / dropoff) → goes live on Shopify ──

export async function activateListing({
  admin,
  listingId,
}: {
  admin: AdminApiContext;
  listingId: string;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: { include: { product: true } } },
  });

  if (listing.status !== "approved_awaiting_dropoff") {
    throw new Error(`Cannot activate listing with status "${listing.status}"`);
  }

  const { variant } = listing;
  const { product } = variant;

  // Auto-generate barcode for non-footwear if not present
  if (!variant.gtin) {
    const sub = product.category ? parseCategory(product.category).sub : undefined;
    let barcode: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = generateBarcode(product.brand ?? undefined, sub, variant.size);
      const existing = await prisma.variant.findUnique({ where: { gtin: candidate } });
      if (!existing) { barcode = candidate; break; }
    }
    if (!barcode) throw new Error("Failed to generate unique barcode after 3 attempts");
    await prisma.variant.update({
      where: { id: variant.id },
      data: { gtin: barcode },
    });
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: "active", listedAt: new Date() },
    include: { consignor: true, variant: { include: { product: true } } },
  });

  // Shopify sync (best-effort)
  try {
    const freshVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });
    const freshProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });

    const imageData = freshProduct.imageUrl?.startsWith("data:") ? freshProduct.imageUrl : undefined;

    await ensureShopifyProductAndVariant({
      admin,
      product: freshProduct,
      variant: freshVariant,
      imageData,
    });

    if (imageData) {
      const afterSync = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      if (afterSync.imageUrl && !afterSync.imageUrl.startsWith("data:")) {
        // Already updated, good
      }
    }

    const syncedVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });
    await syncInventory({ admin, variant: syncedVariant });
  } catch (err) {
    console.error("Shopify sync failed during activation (will retry on next operation):", err);
  }

  return updated;
}

// ── Admin: Approve a withdrawal request → pending pickup ──

export async function approveWithdrawal({
  admin,
  listingId,
}: {
  admin: AdminApiContext;
  listingId: string;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: true },
  });

  if (listing.status !== "withdrawal_requested") {
    throw new Error(`Cannot approve withdrawal for listing with status "${listing.status}"`);
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: "pending_pickup", withdrawalApprovedAt: new Date() },
    include: { consignor: true, variant: { include: { product: true } } },
  });

  try {
    const variant = await prisma.variant.findUniqueOrThrow({ where: { id: listing.variantId } });
    await syncInventory({ admin, variant });
  } catch (err) {
    console.error("Shopify sync failed during withdrawal approval:", err);
  }

  return updated;
}

// ── Admin: Complete withdrawal (consignor picked up item) ──

export async function completeWithdrawal({
  listingId,
}: {
  listingId: string;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });

  if (listing.status !== "pending_pickup") {
    throw new Error(`Cannot complete withdrawal for listing with status "${listing.status}"`);
  }

  return prisma.listing.update({
    where: { id: listingId },
    data: { status: "withdrawn" },
    include: { consignor: true, variant: { include: { product: true } } },
  });
}
