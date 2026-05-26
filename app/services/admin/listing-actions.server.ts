import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { deleteListing, bulkDeleteListings, createListing, restoreListing } from "~/services/listings";
import {
  approveListing,
  rejectListing,
  checkinListing,
  adminEditAndApprove,
  adminEditListing,
  adminEditProduct,
  bulkApproveListing,
  bulkCheckinListing,
  bulkApproveWithdrawal,
  bulkDenyWithdrawal,
  bulkCompleteWithdrawal,
  bulkEditListings,
  approveWithdrawal,
  denyWithdrawal,
  completeWithdrawal,
  updateListingCost,
} from "~/services/submission";
import prisma from "~/db.server";
import { ensureShopifyProductAndVariant } from "~/services/shopify/products.server";
import { syncInventory } from "~/services/inventory";

export async function handleListingAction(admin: AdminApiContext, formData: FormData) {
  const intent = formData.get("intent") as string;

  if (intent === "delete") {
    const listing = await deleteListing({
      admin,
      listingId: formData.get("listingId") as string,
    });
    return { listing, intent };
  }

  if (intent === "bulk-delete") {
    const ids = (formData.get("listingIds") as string).split(",").filter(Boolean);
    if (ids.length > 500) throw new Error("Cannot process more than 500 listings at once");
    const result = await bulkDeleteListings({ admin, listingIds: ids });
    return { cancelled: result.cancelled, syncErrors: result.errors, intent };
  }

  if (intent === "quick-add") {
    const { quickAddListingSchema, parseForm } = await import("~/lib/validation");
    const data = parseForm(quickAddListingSchema, formData);
    const forceCreate = formData.get("forceCreate") === "1";
    try {
      const listing = await createListing({
        admin,
        title: data.title,
        brand: data.brand,
        category: data.category,
        sku: data.sku,
        size: data.size,
        gtin: data.gtin,
        price: data.price,
        count: data.quantity,
        consignorId: data.consignorId,
        cost: data.cost,
        useExistingProductId: data.useExistingProductId || undefined,
        forceCreate,
      });
      return { listing, intent, quantity: data.quantity };
    } catch (err) {
      const { DuplicateError } = await import("~/services/catalog");
      if (err instanceof DuplicateError) {
        return {
          error: "duplicate-product" as const,
          intent,
          duplicate: err.match,
          submitted: Object.fromEntries(formData.entries()),
        };
      }
      throw err;
    }
  }

  if (intent === "approve") {
    const listingId = formData.get("listingId") as string;
    await approveListing({ listingId });
    return { intent };
  }

  if (intent === "reject") {
    const { rejectListingSchema, parseForm } = await import("~/lib/validation");
    const data = parseForm(rejectListingSchema, formData);
    await rejectListing({ listingId: data.listingId, reason: data.reason });
    return { intent };
  }

  if (intent === "checkin") {
    const listingId = formData.get("listingId") as string;
    await checkinListing({ admin, listingId });
    return { intent };
  }

  if (intent === "edit-product") {
    const { adminEditProductSchema, parseForm } = await import("~/lib/validation");
    const data = parseForm(adminEditProductSchema, formData);
    await adminEditProduct({
      admin,
      productId: data.productId,
      title: data.title,
      brand: data.brand,
      category: data.category,
      sku: data.sku,
      imageData: data.imageData,
    });
    return { intent };
  }

  if (intent === "admin-edit-approve") {
    const { adminEditListingSchema, parseForm } = await import("~/lib/validation");
    const data = parseForm(adminEditListingSchema, formData);
    await adminEditAndApprove({
      listingId: data.listingId,
      size: data.size,
      gtin: data.gtin,
      price: data.price,
    });
    return { intent };
  }

  if (intent === "admin-edit") {
    const { adminEditListingSchema, parseForm } = await import("~/lib/validation");
    const data = parseForm(adminEditListingSchema, formData);
    await adminEditListing({
      admin,
      listingId: data.listingId,
      size: data.size,
      gtin: data.gtin,
      price: data.price,
      cost: data.cost,
    });
    return { intent };
  }

  if (intent === "bulk-approve") {
    const ids = (formData.get("listingIds") as string).split(",").filter(Boolean);
    if (ids.length > 500) throw new Error("Cannot process more than 500 listings at once");
    const result = await bulkApproveListing({ listingIds: ids });
    return { approved: result.approved, intent };
  }

  if (intent === "bulk-checkin") {
    const ids = (formData.get("listingIds") as string).split(",").filter(Boolean);
    if (ids.length > 500) throw new Error("Cannot process more than 500 listings at once");
    const result = await bulkCheckinListing({ admin, listingIds: ids });
    return { activated: result.activated, syncErrors: result.errors, intent };
  }

  if (intent === "bulk-approve-withdrawal") {
    const ids = (formData.get("listingIds") as string).split(",").filter(Boolean);
    if (ids.length > 500) throw new Error("Cannot process more than 500 listings at once");
    const result = await bulkApproveWithdrawal({ admin, listingIds: ids });
    return { approved: result.approved, skipped: result.skipped, intent };
  }

  if (intent === "bulk-deny-withdrawal") {
    const ids = (formData.get("listingIds") as string).split(",").filter(Boolean);
    const reason = (formData.get("reason") as string | null)?.trim() || undefined;
    if (ids.length > 500) throw new Error("Cannot process more than 500 listings at once");
    const result = await bulkDenyWithdrawal({ admin, listingIds: ids, reason });
    return { denied: result.denied, skipped: result.skipped, intent };
  }

  if (intent === "bulk-complete-withdrawal") {
    const ids = (formData.get("listingIds") as string).split(",").filter(Boolean);
    if (ids.length > 500) throw new Error("Cannot process more than 500 listings at once");
    const result = await bulkCompleteWithdrawal({ admin, listingIds: ids });
    return { completed: result.completed, skipped: result.skipped, intent };
  }

  if (intent === "bulk-edit") {
    const ids = (formData.get("listingIds") as string ?? "").split(",").filter(Boolean);
    if (ids.length === 0) return { error: "No listings selected", intent };
    if (ids.length > 500) throw new Error("Cannot process more than 500 listings at once");

    // Only include fields the admin actually provided. Empty string = "no change".
    const brandRaw = (formData.get("brand") as string ?? "").trim();
    const categoryRaw = (formData.get("category") as string ?? "").trim();
    const costRaw = (formData.get("cost") as string ?? "").trim();
    const priceRaw = (formData.get("price") as string ?? "").trim();

    const fields: Record<string, unknown> = {};
    if (brandRaw) fields.brand = brandRaw;
    if (categoryRaw) fields.category = categoryRaw;
    if (costRaw) {
      const c = parseFloat(costRaw);
      if (isNaN(c) || c < 0 || c > 999999.99) return { error: "Invalid cost", intent };
      fields.cost = Math.round(c * 100) / 100;
    }
    if (priceRaw) {
      const p = parseFloat(priceRaw);
      if (isNaN(p) || p <= 0 || p > 999999.99) return { error: "Invalid price", intent };
      fields.price = Math.round(p * 100) / 100;
    }

    if (Object.keys(fields).length === 0) {
      return { error: "Nothing to update — every field is empty", intent };
    }

    try {
      const result = await bulkEditListings({ admin, listingIds: ids, ...fields });
      return { ...result, intent };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Bulk edit failed", intent };
    }
  }

  if (intent === "approve-withdrawal") {
    const listingId = formData.get("listingId") as string;
    await approveWithdrawal({ admin, listingId });
    return { intent };
  }

  if (intent === "deny-withdrawal") {
    const listingId = formData.get("listingId") as string;
    const reason = (formData.get("reason") as string | null)?.trim() || undefined;
    await denyWithdrawal({ admin, listingId, reason });
    return { intent };
  }

  if (intent === "complete-withdrawal") {
    const listingId = formData.get("listingId") as string;
    await completeWithdrawal({ listingId });
    return { intent };
  }

  if (intent === "set-section") {
    const productId = formData.get("productId") as string;
    const sectionId = (formData.get("sectionId") as string) || null;
    await prisma.product.update({ where: { id: productId }, data: { sectionId } });
    return { intent };
  }

  if (intent === "restore") {
    await restoreListing({ admin, listingId: formData.get("listingId") as string });
    return { intent };
  }

  if (intent === "update-cost") {
    const listingId = formData.get("listingId") as string;
    const cost = parseFloat(formData.get("cost") as string);
    if (isNaN(cost) || cost < 0) throw new Error("Invalid cost value");
    await updateListingCost({ listingId, cost });
    return { intent };
  }

  if (intent === "retry-sync") {
    const listingId = formData.get("listingId") as string;
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: listingId },
      include: { variant: { include: { product: true } } },
    });
    await ensureShopifyProductAndVariant({ admin, product: listing.variant.product, variant: listing.variant });
    const syncedVariant = await prisma.variant.findUniqueOrThrow({ where: { id: listing.variant.id } });
    await syncInventory({ admin, variant: syncedVariant });
    return { intent };
  }

  throw new Error("Invalid intent");
}
