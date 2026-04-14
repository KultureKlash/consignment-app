import { describe, it, expect } from "vitest";
import { prisma } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import { findOrCreateProduct, findOrCreateVariant } from "~/services/catalog.server";
import { ensureShopifyProductAndVariant } from "~/services/shopify/products.server";

describe("shopify-products.server", () => {
  describe("ensureShopifyProductAndVariant", () => {
    it("creates product + variant in Shopify when neither exists", async () => {
      const { admin, findCalls } = createMockAdmin();

      const product = await findOrCreateProduct({
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
      });
      const variant = await findOrCreateVariant({ productId: product.id, size: "9", gtin: "TEST-GTIN-9" });

      await ensureShopifyProductAndVariant({ admin, product, variant });

      // Should have called productCreate
      const createCalls = findCalls("productCreate");
      expect(createCalls).toHaveLength(1);

      // Should have called inventoryItemUpdate (tracked: true + sku)
      const trackCalls = findCalls("inventoryItemUpdate");
      expect(trackCalls).toHaveLength(2);

      // DB should be updated with Shopify IDs
      const updatedProduct = await prisma.product.findUnique({ where: { id: product.id } });
      expect(updatedProduct?.shopifyProductId).toMatch(/gid:\/\/shopify\/Product\//);

      const updatedVariant = await prisma.variant.findUnique({ where: { id: variant.id } });
      expect(updatedVariant?.shopifyVariantId).toMatch(/gid:\/\/shopify\/ProductVariant\//);
      expect(updatedVariant?.inventoryItemId).toMatch(/gid:\/\/shopify\/InventoryItem\//);
    });

    it("passes explicit taxonomy ID to productCreate", async () => {
      const { admin, findCalls } = createMockAdmin();

      const product = await findOrCreateProduct({
        sku: "TAX-TEST-001",
        title: "Nike Air Max 90",
        brand: "Nike",
        category: "Footwear > Sneakers",
      });
      const variant = await findOrCreateVariant({ productId: product.id, size: "10", gtin: "TAX-GTIN-10" });

      const explicitId = "gid://shopify/TaxonomyCategory/aa-1-2-3";
      await ensureShopifyProductAndVariant({ admin, product, variant, taxonomyId: explicitId });

      const createCalls = findCalls("productCreate");
      expect(createCalls).toHaveLength(1);
      const vars = createCalls[0].variables as Record<string, Record<string, unknown>>;
      expect(vars.product.category).toBe(explicitId);
    });

    it("auto-resolves taxonomy ID from category when no explicit ID", async () => {
      const { admin, findCalls } = createMockAdmin();

      const product = await findOrCreateProduct({
        sku: "TAX-AUTO-001",
        title: "Gallery Dept Tee",
        brand: "Gallery Dept",
        category: "Apparel > T-Shirts",
      });
      const variant = await findOrCreateVariant({ productId: product.id, size: "M", gtin: "TAX-AUTO-M" });

      await ensureShopifyProductAndVariant({ admin, product, variant });

      // Should have queried taxonomy for "t-shirts"
      const taxonomyCalls = findCalls("taxonomy");
      expect(taxonomyCalls.length).toBeGreaterThan(0);

      // productCreate should include category field
      const createCalls = findCalls("productCreate");
      expect(createCalls).toHaveLength(1);
      const vars = createCalls[0].variables as Record<string, Record<string, unknown>>;
      expect(vars.product.category).toMatch(/gid:\/\/shopify\/TaxonomyCategory\//);
    });

    it("skips Shopify calls when product + variant already synced", async () => {
      const { admin, graphql } = createMockAdmin();

      // Create product and variant with Shopify IDs already set
      const product = await prisma.product.create({
        data: {
          sku: "DD1391-100",
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
          sku: "DD1391-100",
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

    it("sets SKU to sku for footwear product on create", async () => {
      const { admin, findCalls } = createMockAdmin();

      const product = await findOrCreateProduct({
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
        category: "Footwear > Sneakers",
      });
      const variant = await findOrCreateVariant({ productId: product.id, size: "9", gtin: "TEST-GTIN-9" });

      await ensureShopifyProductAndVariant({ admin, product, variant });

      // After productCreate, SKU is set via inventoryItemUpdate (second call)
      const invCalls = findCalls("inventoryItemUpdate");
      // First call: tracked: true; Second call: sku
      const skuCall = invCalls.find((c) => {
        const vars = c.variables as Record<string, Record<string, unknown>>;
        return vars.input?.sku !== undefined;
      });
      expect(skuCall).toBeDefined();
      const skuVars = skuCall!.variables as Record<string, Record<string, string>>;
      expect(skuVars.input.sku).toBe("DD1391-100");
    });

    it("sets SKU to GTIN for non-footwear product on create", async () => {
      const { admin, findCalls } = createMockAdmin();

      const product = await findOrCreateProduct({
        title: "Ami Paris Bucket Hat",
        brand: "Ami Paris",
        category: "Headwear > Bucket Hats",
      });
      const variant = await findOrCreateVariant({ productId: product.id, size: "O/S", gtin: "AMI-HAT-OS-ABC123" });

      await ensureShopifyProductAndVariant({ admin, product, variant });

      const invCalls = findCalls("inventoryItemUpdate");
      const skuCall = invCalls.find((c) => {
        const vars = c.variables as Record<string, Record<string, unknown>>;
        return vars.input?.sku !== undefined;
      });
      expect(skuCall).toBeDefined();
      const skuVars = skuCall!.variables as Record<string, Record<string, string>>;
      expect(skuVars.input.sku).toBe("AMI-HAT-OS-ABC123");
    });

    it("falls back to GTIN for footwear without sku", async () => {
      const { admin, findCalls } = createMockAdmin();

      const product = await findOrCreateProduct({
        title: "Generic Sneaker",
        brand: "Unknown",
      });
      const variant = await findOrCreateVariant({ productId: product.id, size: "10", gtin: "FALLBACK-GTIN" });

      await ensureShopifyProductAndVariant({ admin, product, variant });

      const invCalls = findCalls("inventoryItemUpdate");
      const skuCall = invCalls.find((c) => {
        const vars = c.variables as Record<string, Record<string, unknown>>;
        return vars.input?.sku !== undefined;
      });
      expect(skuCall).toBeDefined();
      const skuVars = skuCall!.variables as Record<string, Record<string, string>>;
      // No sku + no category = treated as footwear, falls back to gtin
      expect(skuVars.input.sku).toBe("FALLBACK-GTIN");
    });

    it("sets SKU on new variant added to existing product", async () => {
      const { admin, findCalls } = createMockAdmin();

      // Product already synced
      const product = await prisma.product.create({
        data: {
          sku: "DD1391-100",
          title: "Nike Dunk Panda",
          shopifyProductId: "gid://shopify/Product/existing",
        },
      });
      const variant = await prisma.variant.create({
        data: { productId: product.id, size: "10", gtin: "TEST-GTIN-10" },
      });

      await ensureShopifyProductAndVariant({ admin, product, variant });

      // SKU is set via inventoryItemUpdate (combined with tracked: true)
      const createCalls = findCalls("productVariantsBulkCreate");
      expect(createCalls).toHaveLength(1);
      const invCalls = findCalls("inventoryItemUpdate");
      expect(invCalls).toHaveLength(1);
      const invVars = invCalls[0].variables as Record<string, Record<string, unknown>>;
      expect(invVars.input.sku).toBe("DD1391-100");
    });

    it("creates product without taxonomy when category is null", async () => {
      const { admin, findCalls } = createMockAdmin();

      const product = await findOrCreateProduct({
        sku: "NO-CAT-TAX-001",
        title: "Unknown Item",
      });
      const variant = await findOrCreateVariant({ productId: product.id, size: "OS", gtin: "NO-CAT-GTIN" });

      await ensureShopifyProductAndVariant({ admin, product, variant });

      // Product created successfully
      const createCalls = findCalls("productCreate");
      expect(createCalls).toHaveLength(1);

      // No taxonomy query should have been made (category is null)
      const taxonomyCalls = findCalls("taxonomy");
      expect(taxonomyCalls).toHaveLength(0);

      // Verify no category field in mutation variables
      const vars = createCalls[0].variables as Record<string, Record<string, unknown>>;
      expect(vars.product.category).toBeUndefined();
    });
  });
});
