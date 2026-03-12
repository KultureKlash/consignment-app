import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import { cancelListing, updateListingQuantity } from "~/services/listings.server";

async function createTestListing(overrides: { price?: number; quantity?: number; status?: string } = {}) {
  const consignor = await createTestConsignor();
  const product = await prisma.product.create({
    data: { styleId: `style-${Date.now()}`, title: "Test Product" },
  });
  const variant = await prisma.variant.create({
    data: {
      productId: product.id,
      size: "9",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      shopifyVariantId: "gid://shopify/ProductVariant/1",
    },
  });
  const listing = await prisma.listing.create({
    data: {
      consignorId: consignor.id,
      variantId: variant.id,
      price: overrides.price ?? 350,
      quantity: overrides.quantity ?? 2,
      status: overrides.status ?? "active",
    },
  });
  return { consignor, product, variant, listing };
}

describe("cancelListing", () => {
  it("sets status to cancelled", async () => {
    const { admin } = createMockAdmin();
    const { listing } = await createTestListing();

    const result = await cancelListing({ admin, listingId: listing.id });

    expect(result.status).toBe("cancelled");
    const dbListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(dbListing?.status).toBe("cancelled");
  });

  it("triggers inventory sync with reduced total", async () => {
    const { admin, findCalls } = createMockAdmin();
    const { listing } = await createTestListing({ quantity: 5 });

    await cancelListing({ admin, listingId: listing.id });

    const setCalls = findCalls("inventorySetQuantities");
    expect(setCalls).toHaveLength(1);
    const quantities = (setCalls[0].variables as Record<string, Record<string, unknown>>).input
      .quantities as Array<Record<string, unknown>>;
    expect(quantities[0].quantity).toBe(0); // only listing was cancelled
  });

  it("throws for already-cancelled listing", async () => {
    const { admin } = createMockAdmin();
    const { listing } = await createTestListing({ status: "cancelled" });

    await expect(cancelListing({ admin, listingId: listing.id }))
      .rejects.toThrow('Cannot cancel listing with status "cancelled"');
  });

  it("throws for sold listing", async () => {
    const { admin } = createMockAdmin();
    const { listing } = await createTestListing({ status: "sold" });

    await expect(cancelListing({ admin, listingId: listing.id }))
      .rejects.toThrow('Cannot cancel listing with status "sold"');
  });
});

describe("updateListingQuantity", () => {
  it("updates quantity in DB", async () => {
    const { admin } = createMockAdmin();
    const { listing } = await createTestListing({ quantity: 5 });

    const result = await updateListingQuantity({ admin, listingId: listing.id, quantity: 3 });

    expect(result.quantity).toBe(3);
    expect(result.status).toBe("active");
  });

  it("auto-cancels when quantity set to 0", async () => {
    const { admin } = createMockAdmin();
    const { listing } = await createTestListing({ quantity: 5 });

    const result = await updateListingQuantity({ admin, listingId: listing.id, quantity: 0 });

    expect(result.quantity).toBe(0);
    expect(result.status).toBe("cancelled");
  });

  it("rejects negative quantity", async () => {
    const { admin } = createMockAdmin();
    const { listing } = await createTestListing();

    await expect(updateListingQuantity({ admin, listingId: listing.id, quantity: -1 }))
      .rejects.toThrow("Quantity cannot be negative");
  });

  it("triggers inventory sync with updated total", async () => {
    const { admin, findCalls } = createMockAdmin();
    const consignor = await createTestConsignor({ email: "sync@test.com" });
    const product = await prisma.product.create({
      data: { styleId: "SYNC-001", title: "Sync Test" },
    });
    const variant = await prisma.variant.create({
      data: {
        productId: product.id,
        size: "10",
        inventoryItemId: "gid://shopify/InventoryItem/2",
        shopifyVariantId: "gid://shopify/ProductVariant/2",
      },
    });

    // Two listings on same variant at same price
    const listing1 = await prisma.listing.create({
      data: { consignorId: consignor.id, variantId: variant.id, price: 300, quantity: 5 },
    });
    await prisma.listing.create({
      data: { consignorId: consignor.id, variantId: variant.id, price: 300, quantity: 3 },
    });

    // Update first listing from 5 → 2
    await updateListingQuantity({ admin, listingId: listing1.id, quantity: 2 });

    const setCalls = findCalls("inventorySetQuantities");
    expect(setCalls).toHaveLength(1);
    const quantities = (setCalls[0].variables as Record<string, Record<string, unknown>>).input
      .quantities as Array<Record<string, unknown>>;
    expect(quantities[0].quantity).toBe(5); // 2 + 3 = 5 (same price tier)
  });
});
