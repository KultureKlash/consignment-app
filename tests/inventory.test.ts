import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import { syncInventory } from "~/services/inventory";

describe("inventory.server", () => {
  describe("syncInventory", () => {
    it("skips sync when variant has no inventoryItemId", async () => {
      const { admin, graphql } = createMockAdmin();

      const product = await prisma.product.create({
        data: { sku: "DD1391-100", title: "Nike Dunk Panda" },
      });
      const variant = await prisma.variant.create({
        data: { productId: product.id, size: "9", gtin: "TEST-GTIN-9", inventoryItemId: null },
      });

      await syncInventory({ admin, variant });

      // No API calls — variant not synced yet
      expect(graphql).not.toHaveBeenCalled();
    });

    it("sets inventory to 0 when no active listings exist", async () => {
      const { admin, findCalls } = createMockAdmin();

      const product = await prisma.product.create({
        data: { sku: "DD1391-100", title: "Nike Dunk Panda" },
      });
      const variant = await prisma.variant.create({
        data: {
          productId: product.id,
          size: "9",
          gtin: "TEST-GTIN-9",
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

    it("only counts inventory at the lowest price tier", async () => {
      const { admin, findCalls } = createMockAdmin();

      const consignor1 = await createTestConsignor({ email: "a@test.com" });
      const consignor2 = await createTestConsignor({ email: "b@test.com" });

      const product = await prisma.product.create({
        data: { sku: "DD1391-100", title: "Nike Dunk Panda" },
      });
      const variant = await prisma.variant.create({
        data: {
          productId: product.id,
          size: "9",
          gtin: "TEST-GTIN-9",
          inventoryItemId: "gid://shopify/InventoryItem/1",
        },
      });

      // 1 listing at $340, 4 listings at $360
      await prisma.listing.create({
        data: { consignorId: consignor1.id, variantId: variant.id, price: 340, status: "active" },
      });
      for (let i = 0; i < 4; i++) {
        await prisma.listing.create({
          data: { consignorId: consignor2.id, variantId: variant.id, price: 360, status: "active" },
        });
      }

      await syncInventory({ admin, variant });

      const setCalls = findCalls("inventorySetQuantities");
      const quantities = (setCalls[0].variables as Record<string, Record<string, unknown>>).input
        .quantities as Array<Record<string, unknown>>;
      expect(quantities[0].quantity).toBe(1); // only the $340 tier
    });

    it("aggregates count across consignors at the same lowest price", async () => {
      const { admin, findCalls } = createMockAdmin();

      const consignor1 = await createTestConsignor({ email: "a@test.com" });
      const consignor2 = await createTestConsignor({ email: "b@test.com" });

      const product = await prisma.product.create({
        data: { sku: "DD1391-100", title: "Nike Dunk Panda" },
      });
      const variant = await prisma.variant.create({
        data: {
          productId: product.id,
          size: "9",
          gtin: "TEST-GTIN-9",
          inventoryItemId: "gid://shopify/InventoryItem/1",
        },
      });

      // 2 listings from consignor1 at $340
      for (let i = 0; i < 2; i++) {
        await prisma.listing.create({
          data: { consignorId: consignor1.id, variantId: variant.id, price: 340, status: "active" },
        });
      }
      // 3 listings from consignor2 at $340
      for (let i = 0; i < 3; i++) {
        await prisma.listing.create({
          data: { consignorId: consignor2.id, variantId: variant.id, price: 340, status: "active" },
        });
      }

      await syncInventory({ admin, variant });

      const setCalls = findCalls("inventorySetQuantities");
      const quantities = (setCalls[0].variables as Record<string, Record<string, unknown>>).input
        .quantities as Array<Record<string, unknown>>;
      expect(quantities[0].quantity).toBe(5); // 2 + 3 at same price
    });

    it("excludes non-active listings from count", async () => {
      const { admin, findCalls } = createMockAdmin();

      const consignor = await createTestConsignor();
      const product = await prisma.product.create({
        data: { sku: "DD1391-100", title: "Nike Dunk Panda" },
      });
      const variant = await prisma.variant.create({
        data: {
          productId: product.id,
          size: "9",
          gtin: "TEST-GTIN-9",
          inventoryItemId: "gid://shopify/InventoryItem/1",
        },
      });

      // 2 active listings
      for (let i = 0; i < 2; i++) {
        await prisma.listing.create({
          data: { consignorId: consignor.id, variantId: variant.id, price: 350, status: "active" },
        });
      }
      // 5 sold listings (should not count)
      for (let i = 0; i < 5; i++) {
        await prisma.listing.create({
          data: { consignorId: consignor.id, variantId: variant.id, price: 350, status: "sold" },
        });
      }
      // 3 pending_sale listings (should not count)
      for (let i = 0; i < 3; i++) {
        await prisma.listing.create({
          data: { consignorId: consignor.id, variantId: variant.id, price: 350, status: "pending_sale" },
        });
      }

      await syncInventory({ admin, variant });

      const setCalls = findCalls("inventorySetQuantities");
      const quantities = (setCalls[0].variables as Record<string, Record<string, unknown>>).input
        .quantities as Array<Record<string, unknown>>;
      expect(quantities[0].quantity).toBe(2); // only active listings
    });

    it("sends correct locationId and inventoryItemId", async () => {
      const { admin, findCalls } = createMockAdmin();

      const product = await prisma.product.create({
        data: { sku: "DD1391-100", title: "Nike Dunk Panda" },
      });
      const variant = await prisma.variant.create({
        data: {
          productId: product.id,
          size: "9",
          gtin: "TEST-GTIN-9",
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

    it("syncs lowest active listing price to Shopify variant", async () => {
      const { admin, findCalls } = createMockAdmin();

      const consignor1 = await createTestConsignor({ email: "a@test.com" });
      const consignor2 = await createTestConsignor({ email: "b@test.com" });

      const product = await prisma.product.create({
        data: { sku: "DD1391-100", title: "Nike Dunk Panda", shopifyProductId: "gid://shopify/Product/1" },
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

      // 2 listings at $350, 1 listing at $340 (lowest)
      for (let i = 0; i < 2; i++) {
        await prisma.listing.create({
          data: { consignorId: consignor1.id, variantId: variant.id, price: 350, status: "active" },
        });
      }
      await prisma.listing.create({
        data: { consignorId: consignor2.id, variantId: variant.id, price: 340, status: "active" },
      });

      await syncInventory({ admin, variant });

      const priceCalls = findCalls("productVariantsBulkUpdate");
      expect(priceCalls).toHaveLength(1);
      const vars = priceCalls[0].variables as any;
      expect(vars.productId).toBe("gid://shopify/Product/1");
      expect(vars.variants[0].id).toBe("gid://shopify/ProductVariant/1");
      expect(vars.variants[0].price).toBe("340"); // lowest ask
    });

    it("deletes Shopify variant when inventory hits 0 and other variants exist", async () => {
      const { admin, findCalls } = createMockAdmin();

      const product = await prisma.product.create({
        data: { sku: "DD1391-100", title: "Nike Dunk Panda", shopifyProductId: "gid://shopify/Product/1" },
      });
      // Two variants — so it's safe to delete one
      const variant9 = await prisma.variant.create({
        data: {
          productId: product.id,
          size: "9",
          gtin: "TEST-GTIN-9",
          inventoryItemId: "gid://shopify/InventoryItem/1",
          shopifyVariantId: "gid://shopify/ProductVariant/1",
        },
      });
      await prisma.variant.create({
        data: {
          productId: product.id,
          size: "10",
          gtin: "TEST-GTIN-10",
          inventoryItemId: "gid://shopify/InventoryItem/2",
          shopifyVariantId: "gid://shopify/ProductVariant/2",
        },
      });

      // No active listings for sz9
      await syncInventory({ admin, variant: variant9 });

      // Should delete the variant from Shopify
      const deleteCalls = findCalls("productVariantsBulkDelete");
      expect(deleteCalls).toHaveLength(1);
      const vars = deleteCalls[0].variables as any;
      expect(vars.variantsIds).toEqual(["gid://shopify/ProductVariant/1"]);

      // DB should have cleared Shopify IDs
      const updated = await prisma.variant.findUnique({ where: { id: variant9.id } });
      expect(updated?.shopifyVariantId).toBeNull();
      expect(updated?.inventoryItemId).toBeNull();

      // No price update call — variant is gone
      const priceCalls = findCalls("productVariantsBulkUpdate");
      expect(priceCalls).toHaveLength(0);
    });

    it("keeps last variant with price $0 instead of deleting", async () => {
      const { admin, findCalls } = createMockAdmin();

      const product = await prisma.product.create({
        data: { sku: "DD1391-100", title: "Nike Dunk Panda", shopifyProductId: "gid://shopify/Product/1" },
      });
      // Only one variant — can't delete it
      const variant = await prisma.variant.create({
        data: {
          productId: product.id,
          size: "9",
          gtin: "TEST-GTIN-9",
          inventoryItemId: "gid://shopify/InventoryItem/1",
          shopifyVariantId: "gid://shopify/ProductVariant/1",
        },
      });

      await syncInventory({ admin, variant });

      // Should NOT delete
      const deleteCalls = findCalls("productVariantsBulkDelete");
      expect(deleteCalls).toHaveLength(0);

      // Should set price to $0 as fallback
      const priceCalls = findCalls("productVariantsBulkUpdate");
      expect(priceCalls).toHaveLength(1);
      const priceVars = priceCalls[0].variables as any;
      expect(priceVars.variants[0].price).toBe("0");

      // DB Shopify IDs should still be set
      const updated = await prisma.variant.findUnique({ where: { id: variant.id } });
      expect(updated?.shopifyVariantId).toBe("gid://shopify/ProductVariant/1");
    });

    it("skips price sync when variant has no shopifyVariantId", async () => {
      const { admin, findCalls } = createMockAdmin();

      const consignor = await createTestConsignor();
      const product = await prisma.product.create({
        data: { sku: "DD1391-100", title: "Nike Dunk Panda" },
      });
      const variant = await prisma.variant.create({
        data: {
          productId: product.id,
          size: "9",
          gtin: "TEST-GTIN-9",
          inventoryItemId: "gid://shopify/InventoryItem/1",
          shopifyVariantId: null,
        },
      });

      // 2 active listings
      for (let i = 0; i < 2; i++) {
        await prisma.listing.create({
          data: { consignorId: consignor.id, variantId: variant.id, price: 350, status: "active" },
        });
      }

      await syncInventory({ admin, variant });

      const priceCalls = findCalls("productVariantsBulkUpdate");
      expect(priceCalls).toHaveLength(0); // no price sync without shopifyVariantId
    });

    it("price updates to next lowest when cheapest listing is cancelled", async () => {
      const { admin, findCalls } = createMockAdmin();

      const consignor1 = await createTestConsignor({ email: "a@test.com" });
      const consignor2 = await createTestConsignor({ email: "b@test.com" });

      const product = await prisma.product.create({
        data: { sku: "DD1391-100", title: "Nike Dunk Panda", shopifyProductId: "gid://shopify/Product/1" },
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

      await prisma.listing.create({
        data: { consignorId: consignor1.id, variantId: variant.id, price: 340, status: "cancelled" },
      });
      // 2 active listings at $350
      for (let i = 0; i < 2; i++) {
        await prisma.listing.create({
          data: { consignorId: consignor2.id, variantId: variant.id, price: 350, status: "active" },
        });
      }

      await syncInventory({ admin, variant });

      const priceCalls = findCalls("productVariantsBulkUpdate");
      const vars = priceCalls[0].variables as any;
      expect(vars.variants[0].price).toBe("350"); // $340 is cancelled, so next lowest is $350
    });
  });
});
