import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { findOrCreateProduct, findOrCreateVariant } from "~/services/catalog.server";
import { ensureShopifyProductAndVariant, updateShopifyProductImage } from "~/services/shopify-products.server";
import { syncInventory } from "~/services/inventory.server";
import { generateBarcode, parseCategory } from "~/lib/categories";

/** Throws if the consignor account is suspended. Used by all portal-facing functions. */
async function requireActiveConsignor(consignorId: string) {
  const consignor = await prisma.consignor.findUniqueOrThrow({ where: { id: consignorId } });
  if (consignor.status === "suspended") {
    throw new Error("Your account has been suspended. You cannot perform this action.");
  }
  return consignor;
}

// ── Portal: Consignor submits listing(s) for review ──

export async function submitListing({
  consignorId,
  styleId,
  title,
  brand,
  category,
  size,
  gtin,
  price,
  count = 1,
  imageData,
}: {
  consignorId: string;
  styleId?: string | null;
  title: string;
  brand?: string;
  category?: string;
  size: string;
  gtin?: string;
  price: number;
  count?: number;
  imageData?: string;
}) {
  await requireActiveConsignor(consignorId);

  // Find or create product + variant (reuses existing catalog dedup logic)
  const product = await findOrCreateProduct({ styleId, title, brand, category });
  const variant = await findOrCreateVariant({ productId: product.id, size, gtin });

  // Store image on product if provided and product has no image yet
  if (imageData && !product.imageUrl) {
    await prisma.product.update({
      where: { id: product.id },
      data: { imageUrl: imageData }, // stored as base64 data URL, uploaded to Shopify at activation
    });
  }

  // Create count listing rows (per-item model)
  const now = new Date();
  const listings = [];
  for (let i = 0; i < count; i++) {
    const listing = await prisma.listing.create({
      data: {
        consignorId,
        variantId: variant.id,
        price,
        status: "submitted",
        submittedAt: now,
      },
      include: {
        consignor: true,
        variant: { include: { product: true } },
      },
    });
    listings.push(listing);
  }

  return listings[0];
}

// ── Portal: Consignor edits a submitted listing ──

export async function updateSubmittedListing({
  listingId,
  consignorId,
  price,
  size,
  gtin,
}: {
  listingId: string;
  consignorId: string;
  price?: number;
  size?: string;
  gtin?: string;
}) {
  await requireActiveConsignor(consignorId);

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: { include: { product: true } } },
  });

  if (listing.consignorId !== consignorId) {
    throw new Error("Not authorized");
  }
  if (listing.status !== "submitted") {
    throw new Error("Can only edit submitted listings");
  }

  // If size changed, find or create the new variant
  let variantId = listing.variantId;
  if (size && size !== listing.variant.size) {
    const newVariant = await findOrCreateVariant({
      productId: listing.variant.productId,
      size,
      gtin,
    });
    variantId = newVariant.id;
  } else if (gtin && gtin !== listing.variant.gtin) {
    // Just backfill GTIN on existing variant
    await findOrCreateVariant({
      productId: listing.variant.productId,
      size: listing.variant.size,
      gtin,
    });
  }

  return prisma.listing.update({
    where: { id: listingId },
    data: {
      ...(price !== undefined ? { price } : {}),
      ...(variantId !== listing.variantId ? { variantId } : {}),
    },
    include: {
      consignor: true,
      variant: { include: { product: true } },
    },
  });
}

// ── Portal: Consignor deletes a submitted listing ──

export async function deleteSubmittedListing({
  listingId,
  consignorId,
}: {
  listingId: string;
  consignorId: string;
}) {
  await requireActiveConsignor(consignorId);

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
  });

  if (listing.consignorId !== consignorId) {
    throw new Error("Not authorized");
  }
  if (listing.status !== "submitted") {
    throw new Error("Can only delete submitted listings");
  }

  await prisma.listing.delete({ where: { id: listingId } });
}

// ── Admin: Approve a submitted listing ──

export async function approveListing({ listingId }: { listingId: string }) {
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });

  if (listing.status !== "submitted") {
    throw new Error(`Cannot approve listing with status "${listing.status}"`);
  }

  return prisma.listing.update({
    where: { id: listingId },
    data: {
      status: "approved_awaiting_dropoff",
      approvedAt: new Date(),
    },
    include: { consignor: true, variant: { include: { product: true } } },
  });
}

// ── Admin: Reject a submitted listing ──

export async function rejectListing({
  listingId,
  reason,
}: {
  listingId: string;
  reason: string;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });

  if (listing.status !== "submitted") {
    throw new Error(`Cannot reject listing with status "${listing.status}"`);
  }

  return prisma.listing.update({
    where: { id: listingId },
    data: {
      status: "rejected",
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
    include: { consignor: true, variant: { include: { product: true } } },
  });
}

// ── Admin: Edit listing fields and approve in one step ──

export async function adminEditAndApprove({
  listingId,
  title,
  brand,
  category,
  styleId,
  size,
  gtin,
  price,
  imageData,
}: {
  listingId: string;
  title?: string;
  brand?: string;
  category?: string;
  styleId?: string | null;
  size?: string;
  gtin?: string;
  price?: number;
  imageData?: string;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: { include: { product: true } } },
  });

  if (listing.status !== "submitted") {
    throw new Error(`Cannot edit and approve listing with status "${listing.status}"`);
  }

  // Rebuild product/variant if fields changed
  let variantId = listing.variantId;
  const currentProduct = listing.variant.product;

  const needsNewProduct =
    (title && title !== currentProduct.title) ||
    (brand && brand !== currentProduct.brand) ||
    (category && category !== currentProduct.category) ||
    (styleId !== undefined && styleId !== currentProduct.styleId);

  if (needsNewProduct) {
    const product = await findOrCreateProduct({
      styleId: styleId !== undefined ? styleId : currentProduct.styleId,
      title: title ?? currentProduct.title,
      brand: brand ?? currentProduct.brand ?? undefined,
      category: category ?? currentProduct.category ?? undefined,
    });
    const variant = await findOrCreateVariant({
      productId: product.id,
      size: size ?? listing.variant.size,
      gtin: gtin ?? listing.variant.gtin ?? undefined,
    });
    variantId = variant.id;
  } else if (size && size !== listing.variant.size) {
    const variant = await findOrCreateVariant({
      productId: currentProduct.id,
      size,
      gtin: gtin ?? listing.variant.gtin ?? undefined,
    });
    variantId = variant.id;
  } else if (gtin && gtin !== (listing.variant.gtin ?? "")) {
    // GTIN changed on the same variant — update it directly
    await prisma.variant.update({
      where: { id: listing.variantId },
      data: { gtin },
    });
  }

  // Store image on the resolved product if admin uploaded one
  if (imageData) {
    const resolvedVariant = await prisma.variant.findUniqueOrThrow({
      where: { id: variantId },
      select: { productId: true },
    });
    await prisma.product.update({
      where: { id: resolvedVariant.productId },
      data: { imageUrl: imageData },
    });
  }

  return prisma.listing.update({
    where: { id: listingId },
    data: {
      variantId,
      ...(price !== undefined ? { price } : {}),
      status: "approved_awaiting_dropoff",
      approvedAt: new Date(),
    },
    include: { consignor: true, variant: { include: { product: true } } },
  });
}

// ── Admin: Edit listing (any non-terminal status) without changing status ──

const TERMINAL_STATUSES = ["sold", "cancelled", "rejected", "withdrawn"];

export async function adminEditListing({
  admin,
  listingId,
  title,
  brand,
  category,
  styleId,
  size,
  gtin,
  price,
  cost,
  imageData,
}: {
  admin?: AdminApiContext;
  listingId: string;
  title?: string;
  brand?: string;
  category?: string;
  styleId?: string | null;
  size?: string;
  gtin?: string;
  price?: number;
  cost?: number | null;
  imageData?: string;
}) {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: { include: { product: true } }, consignor: true },
  });

  if (TERMINAL_STATUSES.includes(listing.status)) {
    throw new Error(`Cannot edit listing with status "${listing.status}"`);
  }

  // Rebuild product/variant if fields changed (same dedup logic as adminEditAndApprove)
  let variantId = listing.variantId;
  const currentProduct = listing.variant.product;

  const needsNewProduct =
    (title && title !== currentProduct.title) ||
    (brand && brand !== currentProduct.brand) ||
    (category && category !== currentProduct.category) ||
    (styleId !== undefined && styleId !== currentProduct.styleId);

  if (needsNewProduct) {
    const product = await findOrCreateProduct({
      styleId: styleId !== undefined ? styleId : currentProduct.styleId,
      title: title ?? currentProduct.title,
      brand: brand ?? currentProduct.brand ?? undefined,
      category: category ?? currentProduct.category ?? undefined,
    });
    const variant = await findOrCreateVariant({
      productId: product.id,
      size: size ?? listing.variant.size,
      gtin: gtin ?? listing.variant.gtin ?? undefined,
    });
    variantId = variant.id;
  } else if (size && size !== listing.variant.size) {
    const variant = await findOrCreateVariant({
      productId: currentProduct.id,
      size,
      gtin: gtin ?? listing.variant.gtin ?? undefined,
    });
    variantId = variant.id;
  } else if (gtin && gtin !== (listing.variant.gtin ?? "")) {
    await prisma.variant.update({
      where: { id: listing.variantId },
      data: { gtin },
    });
  }

  // Store image on the resolved product if admin uploaded one
  if (imageData) {
    const resolvedVariant = await prisma.variant.findUniqueOrThrow({
      where: { id: variantId },
      select: { productId: true },
    });
    await prisma.product.update({
      where: { id: resolvedVariant.productId },
      data: { imageUrl: imageData },
    });
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      variantId,
      ...(price !== undefined ? { price } : {}),
      ...(cost !== undefined ? { cost } : {}),
    },
    include: { consignor: true, variant: { include: { product: true } } },
  });

  // Re-sync to Shopify if the listing is live
  if (admin && ["active", "pending_sale"].includes(listing.status)) {
    try {
      const freshProduct = await prisma.product.findUniqueOrThrow({
        where: { id: updated.variant.product.id },
      });

      // Update image on existing Shopify product if admin uploaded a new one
      const pendingImage = freshProduct.imageUrl?.startsWith("data:") ? freshProduct.imageUrl : undefined;
      if (pendingImage && freshProduct.shopifyProductId) {
        await updateShopifyProductImage({
          admin,
          productId: freshProduct.id,
          shopifyProductId: freshProduct.shopifyProductId,
          imageData: pendingImage,
        });
      }

      await ensureShopifyProductAndVariant({
        admin,
        product: freshProduct,
        variant: updated.variant,
      });
      await syncInventory({ admin, variant: updated.variant });
    } catch (err) {
      console.error("Shopify sync after edit failed:", err);
    }
  }

  return updated;
}

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

  // Set active + listedAt
  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: "active", listedAt: new Date() },
    include: { consignor: true, variant: { include: { product: true } } },
  });

  // Shopify sync (best-effort)
  try {
    const freshVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });
    const freshProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });

    // Check if product has a pending base64 image (stored during submission)
    const imageData = freshProduct.imageUrl?.startsWith("data:") ? freshProduct.imageUrl : undefined;

    await ensureShopifyProductAndVariant({
      admin,
      product: freshProduct,
      variant: freshVariant,
      imageData,
    });

    // If we uploaded the image, the Shopify URL is now stored — clear the base64
    if (imageData) {
      const afterSync = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      // imageUrl was updated to Shopify CDN URL by ensureShopifyProductAndVariant
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

// ── Admin: Bulk approve ──

export async function bulkApproveListing({ listingIds }: { listingIds: string[] }) {
  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds }, status: "submitted" },
  });

  if (listings.length === 0) return { approved: 0 };

  const now = new Date();
  await prisma.listing.updateMany({
    where: { id: { in: listings.map((l) => l.id) } },
    data: { status: "approved_awaiting_dropoff", approvedAt: now },
  });

  return { approved: listings.length };
}

// ── Admin: Bulk activate ──

export async function bulkActivateListing({
  admin,
  listingIds,
}: {
  admin: AdminApiContext;
  listingIds: string[];
}) {
  const errors: string[] = [];
  let activated = 0;

  for (const id of listingIds) {
    try {
      await activateListing({ admin, listingId: id });
      activated++;
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { activated, errors };
}

// ── Portal: Consignor updates price on an active listing ──

export async function updateActiveListingPrice({
  listingId,
  consignorId,
  price,
}: {
  listingId: string;
  consignorId: string;
  price: number;
}) {
  await requireActiveConsignor(consignorId);
  if (price <= 0) throw new Error("Price must be greater than zero");

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: true },
  });

  if (listing.consignorId !== consignorId) {
    throw new Error("Not authorized");
  }
  if (listing.status !== "active" && listing.status !== "approved_awaiting_dropoff") {
    throw new Error("Can only update price on active or awaiting drop-off listings");
  }

  // Update price in DB
  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { price },
    include: { variant: { include: { product: true } } },
  });

  // Sync to Shopify (best-effort) — get admin via offline session
  try {
    const session = await prisma.session.findFirst({
      where: { isOnline: false, accessToken: { not: "" } },
      select: { shop: true },
    });
    if (session) {
      const { unauthenticated } = await import("~/shopify.server");
      const { admin } = await unauthenticated.admin(session.shop);
      const variant = await prisma.variant.findUniqueOrThrow({
        where: { id: listing.variantId },
      });
      await syncInventory({ admin, variant });
    }
  } catch (err) {
    console.error("Shopify price sync failed (will retry on next operation):", err);
  }

  return updated;
}

// ── Portal: Consignor requests withdrawal of an active listing ──

export async function requestWithdrawal({
  listingId,
  consignorId,
}: {
  listingId: string;
  consignorId: string;
}) {
  await requireActiveConsignor(consignorId);

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { variant: true },
  });

  if (listing.consignorId !== consignorId) {
    throw new Error("Not authorized");
  }
  if (listing.status !== "active") {
    throw new Error("Can only request withdrawal on active listings");
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: "withdrawal_requested", withdrawnAt: new Date() },
    include: { variant: { include: { product: true } } },
  });

  // Sync Shopify — item is no longer active so inventory drops to 0
  try {
    const session = await prisma.session.findFirst({
      where: { isOnline: false, accessToken: { not: "" } },
      select: { shop: true },
    });
    if (session) {
      const { unauthenticated } = await import("~/shopify.server");
      const { admin } = await unauthenticated.admin(session.shop);
      const variant = await prisma.variant.findUniqueOrThrow({
        where: { id: listing.variantId },
      });
      await syncInventory({ admin, variant });
    }
  } catch (err) {
    console.error("Shopify sync failed during withdrawal request:", err);
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

  // Belt-and-suspenders Shopify sync (should already be at 0)
  try {
    const variant = await prisma.variant.findUniqueOrThrow({
      where: { id: listing.variantId },
    });
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
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
  });

  if (listing.status !== "pending_pickup") {
    throw new Error(`Cannot complete withdrawal for listing with status "${listing.status}"`);
  }

  return prisma.listing.update({
    where: { id: listingId },
    data: { status: "withdrawn" },
    include: { consignor: true, variant: { include: { product: true } } },
  });
}
