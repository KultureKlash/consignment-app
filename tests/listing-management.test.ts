import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import { deleteListing, bulkDeleteListings } from "~/services/listing-mutations.server";

async function createTestListing(overrides: { price?: number; status?: string } = {}) {
  const consignor = await createTestConsignor();
  const product = await prisma.product.create({
    data: { sku: `style-${Date.now()}`, title: "Test Product" },
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

describe("deleteListing", () => {
  it("sets status to cancelled", async () => {
    const { admin } = createMockAdmin();
    const { listing } = await createTestListing();

    const result = await deleteListing({ admin, listingId: listing.id });

    expect(result.status).toBe("cancelled");
    const dbListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(dbListing?.status).toBe("cancelled");
  });

  it("triggers inventory sync after cancellation", async () => {
    const { admin, findCalls } = createMockAdmin();
    const { listing } = await createTestListing();

    await deleteListing({ admin, listingId: listing.id });

    const setCalls = findCalls("inventorySetQuantities");
    expect(setCalls).toHaveLength(1);
    const quantities = (setCalls[0].variables as Record<string, Record<string, unknown>>).input
      .quantities as Array<Record<string, unknown>>;
    expect(quantities[0].quantity).toBe(0); // only listing was cancelled
  });

  it("throws for already-cancelled listing", async () => {
    const { admin } = createMockAdmin();
    const { listing } = await createTestListing({ status: "cancelled" });

    await expect(deleteListing({ admin, listingId: listing.id }))
      .rejects.toThrow('Cannot cancel listing with status "cancelled"');
  });

  it("throws for sold listing", async () => {
    const { admin } = createMockAdmin();
    const { listing } = await createTestListing({ status: "sold" });

    await expect(deleteListing({ admin, listingId: listing.id }))
      .rejects.toThrow('Cannot cancel listing with status "sold"');
  });
});

describe("bulkDeleteListings", () => {
  async function createTestListingsForBulk(
    count: number,
    overrides: { status?: string; variantId?: string; consignorId?: string } = {}
  ) {
    const consignor = overrides.consignorId
      ? { id: overrides.consignorId }
      : await createTestConsignor();
    let variant: Awaited<ReturnType<typeof prisma.variant.create>>;
    if (overrides.variantId) {
      variant = await prisma.variant.findUniqueOrThrow({ where: { id: overrides.variantId } });
    } else {
      const product = await prisma.product.create({
        data: { sku: `bulk-style-${Date.now()}-${Math.random()}`, title: "Bulk Product" },
      });
      const uid = `${Date.now()}-${Math.random()}`;
      variant = await prisma.variant.create({
        data: {
          productId: product.id,
          size: "9",
          gtin: `BULK-GTIN-${uid}`,
          inventoryItemId: `gid://shopify/InventoryItem/bulk-${uid}`,
          shopifyVariantId: `gid://shopify/ProductVariant/bulk-${uid}`,
        },
      });
    }
    const listings = [];
    for (let i = 0; i < count; i++) {
      listings.push(
        await prisma.listing.create({
          data: {
            consignorId: consignor.id,
            variantId: variant.id,
            price: 200,
            status: overrides.status ?? "active",
          },
        })
      );
    }
    return { consignor, variant, listings };
  }

  it("cancels all active listings in a single batch", async () => {
    const { admin } = createMockAdmin();
    const { listings } = await createTestListingsForBulk(5);

    const result = await bulkDeleteListings({
      admin,
      listingIds: listings.map((l) => l.id),
    });

    expect(result.cancelled).toBe(5);
    expect(result.errors).toHaveLength(0);

    const dbListings = await prisma.listing.findMany();
    expect(dbListings.every((l) => l.status === "cancelled")).toBe(true);
  });

  it("skips non-active listings", async () => {
    const { admin } = createMockAdmin();
    const { listings: active } = await createTestListingsForBulk(3);
    const consignor = await createTestConsignor({ name: "Sold", email: "sold@test.com" });
    const { listings: sold } = await createTestListingsForBulk(2, {
      status: "sold",
      variantId: active[0].variantId,
      consignorId: consignor.id,
    });

    const allIds = [...active.map((l) => l.id), ...sold.map((l) => l.id)];
    const result = await bulkDeleteListings({ admin, listingIds: allIds });

    expect(result.cancelled).toBe(3);
    // Sold listings unchanged
    const soldListings = await prisma.listing.findMany({ where: { status: "sold" } });
    expect(soldListings).toHaveLength(2);
  });

  it("syncs inventory once per variant, not per listing", async () => {
    const { admin, findCalls } = createMockAdmin();
    const { listings } = await createTestListingsForBulk(10);

    await bulkDeleteListings({ admin, listingIds: listings.map((l) => l.id) });

    // Only 1 inventorySetQuantities call (all listings are on the same variant)
    const syncCalls = findCalls("inventorySetQuantities");
    expect(syncCalls).toHaveLength(1);
  });

  it("returns empty result when no active listings to cancel", async () => {
    const { admin } = createMockAdmin();
    const { listings } = await createTestListingsForBulk(3, { status: "sold" });

    const result = await bulkDeleteListings({
      admin,
      listingIds: listings.map((l) => l.id),
    });

    expect(result.cancelled).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("No active listings");
  });

  it("handles multiple variants across listings", async () => {
    const { admin, findCalls } = createMockAdmin();

    // Create 2 separate products/variants
    const { listings: list1 } = await createTestListingsForBulk(3);
    const { listings: list2 } = await createTestListingsForBulk(2);

    const allIds = [...list1.map((l) => l.id), ...list2.map((l) => l.id)];
    const result = await bulkDeleteListings({ admin, listingIds: allIds });

    expect(result.cancelled).toBe(5);
    // 2 variants = 2 inventory sync calls
    const syncCalls = findCalls("inventorySetQuantities");
    expect(syncCalls).toHaveLength(2);
  });

  it("reports sync errors but still cancels DB records", async () => {
    const { admin } = createMockAdmin({ failOn: ["inventorySetQuantities"] });
    const { listings } = await createTestListingsForBulk(3);

    const result = await bulkDeleteListings({
      admin,
      listingIds: listings.map((l) => l.id),
    });

    // DB records are cancelled
    expect(result.cancelled).toBe(3);
    const dbListings = await prisma.listing.findMany();
    expect(dbListings.every((l) => l.status === "cancelled")).toBe(true);

    // But sync errors reported
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Shopify sync failed");
  });
});
