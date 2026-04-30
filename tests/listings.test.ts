import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import { createListing, queryListings } from "~/services/listings";
import { LISTING_STATUS } from "~/lib/domain";

describe("listings.server", () => {
  describe("createListing", () => {
    it("creates product, variant, listing, and syncs to Shopify", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      const listing = await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 350,
        consignorId: consignor.id,
      });

      expect(listing.price).toBe(350);
      expect(listing.consignor.name).toBe("Test Consignor");

      // DB should have 1 product, 1 variant, 1 listing
      expect(await prisma.product.count()).toBe(1);
      expect(await prisma.variant.count()).toBe(1);
      expect(await prisma.listing.count()).toBe(1);
    });

    it("creates multiple listings with count parameter", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 350,
        count: 3,
        consignorId: consignor.id,
      });

      // 1 product, 1 variant, 3 individual listings
      expect(await prisma.product.count()).toBe(1);
      expect(await prisma.variant.count()).toBe(1);
      expect(await prisma.listing.count()).toBe(3);

      // All listings should be active at the same price
      const listings = await prisma.listing.findMany();
      expect(listings.every((l) => l.price === 350 && l.status === "active")).toBe(true);
    });

    it("reuses existing product when same sku is used", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 350,
        consignorId: consignor.id,
      });

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 340,
        consignorId: consignor.id,
      });

      // Still 1 product and 1 variant, but 2 listings (different prices)
      expect(await prisma.product.count()).toBe(1);
      expect(await prisma.variant.count()).toBe(1);
      expect(await prisma.listing.count()).toBe(2);
    });

    it("creates new variant for different size on same product", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 350,
        consignorId: consignor.id,
      });

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "10",
        gtin: "TEST-GTIN-10",
        price: 340,
        consignorId: consignor.id,
      });

      expect(await prisma.product.count()).toBe(1);
      expect(await prisma.variant.count()).toBe(2);
      expect(await prisma.listing.count()).toBe(2);
    });

    it("creates separate products for different skus", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 350,
        consignorId: consignor.id,
      });

      await createListing({
        admin,
        sku: "555088-001",
        title: "Jordan 1 Retro High OG Bred",
        brand: "Jordan",
        size: "9",
        gtin: "TEST-GTIN-BRED-9",
        price: 450,
        consignorId: consignor.id,
      });

      expect(await prisma.product.count()).toBe(2);
      expect(await prisma.variant.count()).toBe(2);
      expect(await prisma.listing.count()).toBe(2);
    });

    it("supports multiple consignors on the same variant", async () => {
      const { admin } = createMockAdmin();
      const alice = await createTestConsignor({ name: "Alice", email: "alice@test.com" });
      const bob = await createTestConsignor({ name: "Bob", email: "bob@test.com" });

      const listing1 = await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 350,
        count: 2,
        consignorId: alice.id,
      });

      const listing2 = await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 360,
        count: 3,
        consignorId: bob.id,
      });

      expect(listing1.consignor.name).toBe("Alice");
      expect(listing2.consignor.name).toBe("Bob");

      // 1 product, 1 variant, 5 listings (2 + 3)
      expect(await prisma.product.count()).toBe(1);
      expect(await prisma.variant.count()).toBe(1);
      expect(await prisma.listing.count()).toBe(5);
    });

    it("creates separate listings for same consignor+variant+price (no upsert)", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 350,
        count: 2,
        consignorId: consignor.id,
      });

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 350,
        count: 3,
        consignorId: consignor.id,
      });

      // 5 separate listings (no merging)
      expect(await prisma.listing.count()).toBe(5);
    });

    it("creates separate listings for different prices from same consignor", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 340,
        consignorId: consignor.id,
      });

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 350,
        count: 2,
        consignorId: consignor.id,
      });

      // Different prices = separate listings
      expect(await prisma.listing.count()).toBe(3);
    });

    it("creates separate listings for different consignors at same price", async () => {
      const { admin } = createMockAdmin();
      const alice = await createTestConsignor({ name: "Alice", email: "alice@test.com" });
      const bob = await createTestConsignor({ name: "Bob", email: "bob@test.com" });

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 350,
        count: 2,
        consignorId: alice.id,
      });

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 350,
        consignorId: bob.id,
      });

      // Different consignors = separate listings
      expect(await prisma.listing.count()).toBe(3);
    });

    it("count=3 creates exactly 3 listing rows", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 340,
        count: 3,
        consignorId: consignor.id,
      });

      const listings = await prisma.listing.findMany();
      expect(listings).toHaveLength(3);
    });

    it("all created listings have status active, same variantId, and same price", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 340,
        count: 3,
        consignorId: consignor.id,
      });

      const listings = await prisma.listing.findMany();
      expect(listings).toHaveLength(3);

      const variantId = listings[0].variantId;
      expect(listings.every((l) => l.status === "active")).toBe(true);
      expect(listings.every((l) => l.variantId === variantId)).toBe(true);
      expect(listings.every((l) => l.price === 340)).toBe(true);
    });

    it("all created listings have listedAt set", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 340,
        count: 2,
        consignorId: consignor.id,
      });

      const listings = await prisma.listing.findMany();
      expect(listings).toHaveLength(2);
      expect(listings.every((l) => l.listedAt !== null)).toBe(true);
    });

    it("sets Shopify IDs on product and variant after sync", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: 350,
        consignorId: consignor.id,
      });

      // Background sync runs asynchronously — wait for it to complete
      await new Promise((r) => setTimeout(r, 200));

      const product = await prisma.product.findFirst();
      const variant = await prisma.variant.findFirst();

      expect(product?.shopifyProductId).toMatch(/gid:\/\/shopify\/Product\//);
      expect(variant?.shopifyVariantId).toMatch(/gid:\/\/shopify\/ProductVariant\//);
      expect(variant?.inventoryItemId).toMatch(/gid:\/\/shopify\/InventoryItem\//);
    });

    it("saves GTIN on variant", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "194956806653",
        price: 350,
        consignorId: consignor.id,
      });

      const variant = await prisma.variant.findFirst();
      expect(variant?.gtin).toBe("194956806653");
    });

    it("reuses existing GTIN when same variant is used again", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "194956806653",
        price: 350,
        consignorId: consignor.id,
      });

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "194956806653",
        price: 340,
        consignorId: consignor.id,
      });

      // Still 1 variant, GTIN intact
      expect(await prisma.variant.count()).toBe(1);
      const variant = await prisma.variant.findFirst();
      expect(variant?.gtin).toBe("194956806653");
      expect(await prisma.listing.count()).toBe(2);
    });

    it("creates listing without sku using title+brand dedup", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      const listing = await createListing({
        admin,
        title: "Ami Paris Bucket Hat",
        brand: "Ami Paris",
        category: "Headwear > Bucket Hats",
        size: "O/S",
        price: 180,
        consignorId: consignor.id,
      });

      expect(listing.price).toBe(180);
      const product = await prisma.product.findFirst();
      expect(product?.sku).toBeNull();
      expect(product?.title).toBe("Ami Paris Bucket Hat");
    });

    it("auto-generates barcode for non-footwear when GTIN not provided", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        title: "Ami Paris Bucket Hat",
        brand: "Ami Paris",
        category: "Headwear > Bucket Hats",
        size: "O/S",
        price: 180,
        consignorId: consignor.id,
      });

      const variant = await prisma.variant.findFirst();
      expect(variant?.gtin).toBeDefined();
      expect(variant!.gtin).not.toBe("");
      // Should follow pattern: BRAND-SUBCAT-SIZE-RANDOM
      expect(variant!.gtin).toMatch(/^[A-Z]+-[A-Z]+-[A-Z0-9/]+-[A-Z0-9]+$/);
    });

    it("preserves user-provided GTIN for non-footwear", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        title: "Gallery Dept Tee",
        brand: "Gallery Dept",
        category: "Apparel > T-Shirts",
        size: "L",
        gtin: "MY-CUSTOM-BARCODE",
        price: 250,
        consignorId: consignor.id,
      });

      const variant = await prisma.variant.findFirst();
      expect(variant?.gtin).toBe("MY-CUSTOM-BARCODE");
    });

    it("deduplicates non-footwear products by title+brand", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        title: "Ami Paris Bucket Hat",
        brand: "Ami Paris",
        category: "Headwear > Bucket Hats",
        size: "O/S",
        price: 180,
        consignorId: consignor.id,
      });

      await createListing({
        admin,
        title: "Ami Paris Bucket Hat",
        brand: "Ami Paris",
        category: "Headwear > Bucket Hats",
        size: "O/S",
        price: 200,
        consignorId: consignor.id,
      });

      // Same product, same variant, 2 listings
      expect(await prisma.product.count()).toBe(1);
      expect(await prisma.variant.count()).toBe(1);
      expect(await prisma.listing.count()).toBe(2);
    });

    it("creates listing with null price → AWAITING_PRICE status, no listedAt", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        gtin: "TEST-GTIN-9",
        price: null,
        count: 2,
        consignorId: consignor.id,
      });

      const listings = await prisma.listing.findMany();
      expect(listings).toHaveLength(2);
      expect(listings.every((l) => l.price === null)).toBe(true);
      expect(listings.every((l) => l.status === "awaiting_price")).toBe(true);
      expect(listings.every((l) => l.listedAt === null)).toBe(true);
    });

    it("creates listing with null price does NOT trigger Shopify sync", async () => {
      const { admin, calls } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        sku: "NO-PRICE-001",
        title: "Unpriced Product",
        brand: "TestBrand",
        size: "9",
        gtin: "NOPRICE-GTIN",
        price: null,
        consignorId: consignor.id,
      });

      // Wait for any potential background sync
      await new Promise((r) => setTimeout(r, 200));

      // Shopify should never have been touched — no product/variant on Shopify
      const product = await prisma.product.findFirst();
      expect(product?.shopifyProductId).toBeNull();

      // Shopify mutations should not have been invoked
      const inventoryCalls = calls.filter((c) => c.query.includes("inventorySetQuantities") || c.query.includes("productCreate"));
      expect(inventoryCalls.length).toBe(0);
    });

    it("still creates listing when Shopify sync fails (resilient)", async () => {
      // Shopify sync wrapped in try/catch — listing creation should NOT fail
      const { admin } = createMockAdmin({ failOn: ["productCreate"] });
      const consignor = await createTestConsignor();

      const listing = await createListing({
        admin,
        sku: "SYNC-FAIL-001",
        title: "Test Product Sync Fail",
        brand: "TestBrand",
        size: "9",
        gtin: "SYNC-FAIL-GTIN",
        price: 200,
        consignorId: consignor.id,
      });

      // Listing was created in DB despite Shopify failure
      expect(listing).toBeDefined();
      expect(listing.price).toBe(200);
      expect(await prisma.listing.count()).toBe(1);

      // Product and variant exist in local DB
      expect(await prisma.product.count()).toBe(1);
      expect(await prisma.variant.count()).toBe(1);

      // But Shopify IDs were NOT set (sync failed)
      const product = await prisma.product.findFirst();
      expect(product?.shopifyProductId).toBeNull();
    });
  });

  describe("queryListings — statuses[] filter (admin tab buckets)", () => {
    async function seedAcrossStatuses() {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      // Create one listing per status by creating priced and unpriced + manually updating
      const a = await createListing({ admin, sku: "A", title: "A", brand: "X", size: "9", gtin: "GA", price: 100, consignorId: consignor.id });
      const b = await createListing({ admin, sku: "B", title: "B", brand: "X", size: "9", gtin: "GB", price: 200, consignorId: consignor.id });
      const c = await createListing({ admin, sku: "C", title: "C", brand: "X", size: "9", gtin: "GC", price: null, consignorId: consignor.id });
      const d = await createListing({ admin, sku: "D", title: "D", brand: "X", size: "9", gtin: "GD", price: 400, consignorId: consignor.id });

      await prisma.listing.update({ where: { id: b.id }, data: { status: LISTING_STATUS.PENDING_SALE } });
      await prisma.listing.update({ where: { id: d.id }, data: { status: LISTING_STATUS.SOLD } });
      // c stays AWAITING_PRICE; a stays ACTIVE
      return { active: a.id, pendingSale: b.id, awaitingPrice: c.id, sold: d.id };
    }

    it("filters by a single bucket's statuses[]", async () => {
      await seedAcrossStatuses();
      const result = await queryListings({
        statuses: [LISTING_STATUS.ACTIVE, LISTING_STATUS.PENDING_SALE],
      });
      expect(result.listings).toHaveLength(2);
      const statuses = new Set(result.listings.map((l) => l.status));
      expect(statuses).toEqual(new Set([LISTING_STATUS.ACTIVE, LISTING_STATUS.PENDING_SALE]));
    });

    it("statuses=[] is a no-op (returns all)", async () => {
      await seedAcrossStatuses();
      const result = await queryListings({ statuses: [] });
      expect(result.listings).toHaveLength(4);
    });

    it("combines with search filter (AND, not OR)", async () => {
      await seedAcrossStatuses();
      const result = await queryListings({
        statuses: [LISTING_STATUS.ACTIVE, LISTING_STATUS.PENDING_SALE],
        search: "A",
      });
      // Only listing A matches both filters (active + title "A")
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0].variant.product.title).toBe("A");
    });

    it("statuses takes precedence over single status when both passed", async () => {
      await seedAcrossStatuses();
      const result = await queryListings({
        status: LISTING_STATUS.SOLD,
        statuses: [LISTING_STATUS.ACTIVE],
      });
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0].status).toBe(LISTING_STATUS.ACTIVE);
    });
  });
});
