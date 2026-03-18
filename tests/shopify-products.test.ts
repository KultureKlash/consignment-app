import { describe, it, expect } from "vitest";
import { prisma } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import { findOrCreateProduct, findOrCreateVariant } from "~/services/catalog.server";
import { ensureShopifyProductAndVariant } from "~/services/shopify-products.server";

describe("shopify-products.server", () => {
  describe("ensureShopifyProductAndVariant", () => {
    it("creates product + variant in Shopify when neither exists", async () => {
      const { admin, findCalls } = createMockAdmin();

      const product = await findOrCreateProduct({
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
      });
      const variant = await findOrCreateVariant({ productId: product.id, size: "9", gtin: "TEST-GTIN-9" });

      await ensureShopifyProductAndVariant({ admin, product, variant });

      // Should have called productCreate
      const createCalls = findCalls("productCreate");
      expect(createCalls).toHaveLength(1);

      // Should have called inventoryItemUpdate (tracked: true)
      const trackCalls = findCalls("inventoryItemUpdate");
      expect(trackCalls).toHaveLength(1);

      // DB should be updated with Shopify IDs
      const updatedProduct = await prisma.product.findUnique({ where: { id: product.id } });
      expect(updatedProduct?.shopifyProductId).toMatch(/gid:\/\/shopify\/Product\//);

      const updatedVariant = await prisma.variant.findUnique({ where: { id: variant.id } });
      expect(updatedVariant?.shopifyVariantId).toMatch(/gid:\/\/shopify\/ProductVariant\//);
      expect(updatedVariant?.inventoryItemId).toMatch(/gid:\/\/shopify\/InventoryItem\//);
    });

    it("skips Shopify calls when product + variant already synced", async () => {
      const { admin, graphql } = createMockAdmin();

      // Create product and variant with Shopify IDs already set
      const product = await prisma.product.create({
        data: {
          styleId: "DD1391-100",
          title: "Nike Dunk Panda",
          shopifyProductId: "gid://shopify/Product/existing",
        },
      });
      const variant = await prisma.variant.create({
        data: {
          productId: product.id,
          size: "9",
          gtin: "TEST-GTIN-9",
          shopifyVariantId: "gid://shopify/ProductVariant/existing",
          inventoryItemId: "gid://shopify/InventoryItem/existing",
        },
      });

      await ensureShopifyProductAndVariant({ admin, product, variant });

      // No Shopify API calls made
      expect(graphql).not.toHaveBeenCalled();
    });

    it("adds new variant to existing Shopify product", async () => {
      const { admin, findCalls } = createMockAdmin();

      // Product already synced, but new variant isn't
      const product = await prisma.product.create({
        data: {
          styleId: "DD1391-100",
          title: "Nike Dunk Panda",
          shopifyProductId: "gid://shopify/Product/existing",
        },
      });
      const variant = await prisma.variant.create({
        data: { productId: product.id, size: "10", gtin: "TEST-GTIN-10" },
      });

      await ensureShopifyProductAndVariant({ admin, product, variant });

      // Should use productVariantsBulkCreate, NOT productCreate
      expect(findCalls("productCreate")).toHaveLength(0);
      expect(findCalls("productVariantsBulkCreate")).toHaveLength(1);

      // Should set tracked: true
      expect(findCalls("inventoryItemUpdate")).toHaveLength(1);

      // Variant should have Shopify IDs now
      const updated = await prisma.variant.findUnique({ where: { id: variant.id } });
      expect(updated?.shopifyVariantId).toBeDefined();
      expect(updated?.inventoryItemId).toBeDefined();
    });
  });
});
