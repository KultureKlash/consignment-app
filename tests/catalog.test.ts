import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { findOrCreateProduct, findOrCreateVariant } from "~/services/catalog.server";

describe("catalog.server", () => {
  describe("findOrCreateProduct", () => {
    it("creates a new product when none exists", async () => {
      const product = await findOrCreateProduct({
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
      });

      expect(product.styleId).toBe("DD1391-100");
      expect(product.title).toBe("Nike Dunk Panda");
      expect(product.brand).toBe("Nike");
      expect(product.id).toBeDefined();
    });

    it("returns existing product on second call with same styleId", async () => {
      const first = await findOrCreateProduct({
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
      });

      const second = await findOrCreateProduct({
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
      });

      expect(second.id).toBe(first.id);

      // Only 1 product in DB
      const count = await prisma.product.count();
      expect(count).toBe(1);
    });

    it("creates separate products for different styleIds", async () => {
      await findOrCreateProduct({
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
      });

      await findOrCreateProduct({
        styleId: "555088-001",
        title: "Jordan 1 Retro High OG Bred",
        brand: "Jordan",
      });

      const count = await prisma.product.count();
      expect(count).toBe(2);
    });
  });

  describe("findOrCreateVariant", () => {
    it("creates a new variant for a product", async () => {
      const product = await findOrCreateProduct({
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
      });

      const variant = await findOrCreateVariant({
        productId: product.id,
        size: "9",
      });

      expect(variant.productId).toBe(product.id);
      expect(variant.size).toBe("9");
    });

    it("returns existing variant on second call with same product + size", async () => {
      const product = await findOrCreateProduct({
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
      });

      const first = await findOrCreateVariant({ productId: product.id, size: "9" });
      const second = await findOrCreateVariant({ productId: product.id, size: "9" });

      expect(second.id).toBe(first.id);

      const count = await prisma.variant.count();
      expect(count).toBe(1);
    });

    it("creates separate variants for different sizes", async () => {
      const product = await findOrCreateProduct({
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
      });

      await findOrCreateVariant({ productId: product.id, size: "9" });
      await findOrCreateVariant({ productId: product.id, size: "10" });

      const count = await prisma.variant.count();
      expect(count).toBe(2);
    });
  });
});
