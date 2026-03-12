import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import { createListing } from "~/services/listings.server";

describe("listings.server", () => {
  describe("createListing", () => {
    it("creates product, variant, listing, and syncs to Shopify", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      const listing = await createListing({
        admin,
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        price: 350,
        quantity: 2,
        consignorId: consignor.id,
      });

      expect(listing.price).toBe(350);
      expect(listing.quantity).toBe(2);
      expect(listing.consignor.name).toBe("Test Consignor");

      // DB should have 1 product, 1 variant, 1 listing
      expect(await prisma.product.count()).toBe(1);
      expect(await prisma.variant.count()).toBe(1);
      expect(await prisma.listing.count()).toBe(1);
    });

    it("reuses existing product when same styleId is used", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        price: 350,
        quantity: 2,
        consignorId: consignor.id,
      });

      await createListing({
        admin,
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        price: 340,
        quantity: 1,
        consignorId: consignor.id,
      });

      // Still 1 product and 1 variant, but 2 listings
      expect(await prisma.product.count()).toBe(1);
      expect(await prisma.variant.count()).toBe(1);
      expect(await prisma.listing.count()).toBe(2);
    });

    it("creates new variant for different size on same product", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        price: 350,
        quantity: 2,
        consignorId: consignor.id,
      });

      await createListing({
        admin,
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "10",
        price: 340,
        quantity: 1,
        consignorId: consignor.id,
      });

      expect(await prisma.product.count()).toBe(1);
      expect(await prisma.variant.count()).toBe(2);
      expect(await prisma.listing.count()).toBe(2);
    });

    it("creates separate products for different styleIds", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        price: 350,
        quantity: 2,
        consignorId: consignor.id,
      });

      await createListing({
        admin,
        styleId: "555088-001",
        title: "Jordan 1 Retro High OG Bred",
        brand: "Jordan",
        size: "9",
        price: 450,
        quantity: 1,
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
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        price: 350,
        quantity: 2,
        consignorId: alice.id,
      });

      const listing2 = await createListing({
        admin,
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        price: 360,
        quantity: 3,
        consignorId: bob.id,
      });

      expect(listing1.consignor.name).toBe("Alice");
      expect(listing2.consignor.name).toBe("Bob");

      // 1 product, 1 variant, 2 listings
      expect(await prisma.product.count()).toBe(1);
      expect(await prisma.variant.count()).toBe(1);
      expect(await prisma.listing.count()).toBe(2);
    });

    it("upserts when same consignor+variant+price already active", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        price: 350,
        quantity: 2,
        consignorId: consignor.id,
      });

      await createListing({
        admin,
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        price: 350,
        quantity: 3,
        consignorId: consignor.id,
      });

      // Should merge into 1 listing with qty 5
      expect(await prisma.listing.count()).toBe(1);
      const listing = await prisma.listing.findFirst();
      expect(listing?.quantity).toBe(5);
    });

    it("creates separate listings for different prices from same consignor", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        price: 340,
        quantity: 1,
        consignorId: consignor.id,
      });

      await createListing({
        admin,
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        price: 350,
        quantity: 2,
        consignorId: consignor.id,
      });

      // Different prices = separate listings
      expect(await prisma.listing.count()).toBe(2);
    });

    it("creates separate listings for different consignors at same price", async () => {
      const { admin } = createMockAdmin();
      const alice = await createTestConsignor({ name: "Alice", email: "alice@test.com" });
      const bob = await createTestConsignor({ name: "Bob", email: "bob@test.com" });

      await createListing({
        admin,
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        price: 350,
        quantity: 2,
        consignorId: alice.id,
      });

      await createListing({
        admin,
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        price: 350,
        quantity: 1,
        consignorId: bob.id,
      });

      // Different consignors = separate listings
      expect(await prisma.listing.count()).toBe(2);
    });

    it("sets Shopify IDs on product and variant after sync", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        size: "9",
        price: 350,
        quantity: 2,
        consignorId: consignor.id,
      });

      const product = await prisma.product.findFirst();
      const variant = await prisma.variant.findFirst();

      expect(product?.shopifyProductId).toMatch(/gid:\/\/shopify\/Product\//);
      expect(variant?.shopifyVariantId).toMatch(/gid:\/\/shopify\/ProductVariant\//);
      expect(variant?.inventoryItemId).toMatch(/gid:\/\/shopify\/InventoryItem\//);
    });
  });
});
