import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import { cancelListing } from "~/services/listings.server";

async function createTestListing(overrides: { price?: number; status?: string } = {}) {
  const consignor = await createTestConsignor();
  const product = await prisma.product.create({
    data: { styleId: `style-${Date.now()}`, title: "Test Product" },
  });
  const variant = await prisma.variant.create({
    data: {
      productId: product.id,
      size: "9",
      gtin: "TEST-GTIN-9",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      shopifyVariantId: "gid://shopify/ProductVariant/1",
    },
  });
  const listing = await prisma.listing.create({
    data: {
      consignorId: consignor.id,
      variantId: variant.id,
      price: overrides.price ?? 350,
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

  it("triggers inventory sync after cancellation", async () => {
    const { admin, findCalls } = createMockAdmin();
    const { listing } = await createTestListing();

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
