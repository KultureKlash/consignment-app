import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import { syncInventory } from "~/services/inventory.server";

describe("inventory.server", () => {
  describe("syncInventory", () => {
    it("skips sync when variant has no inventoryItemId", async () => {
      const { admin, graphql } = createMockAdmin();

      const product = await prisma.product.create({
        data: { styleId: "DD1391-100", title: "Nike Dunk Panda" },
      });
      const variant = await prisma.variant.create({
        data: { productId: product.id, size: "9", inventoryItemId: null },
      });

      await syncInventory({ admin, variant });

      // No API calls — variant not synced yet
      expect(graphql).not.toHaveBeenCalled();
    });

    it("sets inventory to 0 when no active listings exist", async () => {
      const { admin, findCalls } = createMockAdmin();

      const product = await prisma.product.create({
        data: { styleId: "DD1391-100", title: "Nike Dunk Panda" },
      });
      const variant = await prisma.variant.create({
        data: {
          productId: product.id,
          size: "9",
          inventoryItemId: "gid://shopify/InventoryItem/1",
        },
      });

      await syncInventory({ admin, variant });

      const setCalls = findCalls("inventorySetQuantities");
      expect(setCalls).toHaveLength(1);

      const quantities = (setCalls[0].variables as Record<string, Record<string, unknown>>).input
        .quantities as Array<Record<string, unknown>>;
      expect(quantities[0].quantity).toBe(0);
    });

    it("aggregates quantity across multiple active listings", async () => {
      const { admin, findCalls } = createMockAdmin();

      const consignor1 = await createTestConsignor({ email: "a@test.com" });
      const consignor2 = await createTestConsignor({ email: "b@test.com" });

      const product = await prisma.product.create({
        data: { styleId: "DD1391-100", title: "Nike Dunk Panda" },
      });
      const variant = await prisma.variant.create({
        data: {
          productId: product.id,
          size: "9",
          inventoryItemId: "gid://shopify/InventoryItem/1",
        },
      });

      // Two consignors each have listings
      await prisma.listing.create({
        data: { consignorId: consignor1.id, variantId: variant.id, price: 350, quantity: 2, status: "active" },
      });
      await prisma.listing.create({
        data: { consignorId: consignor2.id, variantId: variant.id, price: 340, quantity: 3, status: "active" },
      });

      await syncInventory({ admin, variant });

      const setCalls = findCalls("inventorySetQuantities");
      const quantities = (setCalls[0].variables as Record<string, Record<string, unknown>>).input
        .quantities as Array<Record<string, unknown>>;
      expect(quantities[0].quantity).toBe(5); // 2 + 3
    });

    it("excludes non-active listings from aggregation", async () => {
      const { admin, findCalls } = createMockAdmin();

      const consignor = await createTestConsignor();
      const product = await prisma.product.create({
        data: { styleId: "DD1391-100", title: "Nike Dunk Panda" },
      });
      const variant = await prisma.variant.create({
        data: {
          productId: product.id,
          size: "9",
          inventoryItemId: "gid://shopify/InventoryItem/1",
        },
      });

      await prisma.listing.create({
        data: { consignorId: consignor.id, variantId: variant.id, price: 350, quantity: 2, status: "active" },
      });
      await prisma.listing.create({
        data: { consignorId: consignor.id, variantId: variant.id, price: 350, quantity: 5, status: "sold" },
      });

      await syncInventory({ admin, variant });

      const setCalls = findCalls("inventorySetQuantities");
      const quantities = (setCalls[0].variables as Record<string, Record<string, unknown>>).input
        .quantities as Array<Record<string, unknown>>;
      expect(quantities[0].quantity).toBe(2); // only the active listing
    });

    it("sends correct locationId and inventoryItemId", async () => {
      const { admin, findCalls } = createMockAdmin();

      const product = await prisma.product.create({
        data: { styleId: "DD1391-100", title: "Nike Dunk Panda" },
      });
      const variant = await prisma.variant.create({
        data: {
          productId: product.id,
          size: "9",
          inventoryItemId: "gid://shopify/InventoryItem/42",
        },
      });

      await syncInventory({ admin, variant });

      const setCalls = findCalls("inventorySetQuantities");
      const quantities = (setCalls[0].variables as Record<string, Record<string, unknown>>).input
        .quantities as Array<Record<string, unknown>>;
      expect(quantities[0].inventoryItemId).toBe("gid://shopify/InventoryItem/42");
      expect(quantities[0].locationId).toBe("gid://shopify/Location/1001");
    });
  });
});
