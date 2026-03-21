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

    it("creates product without styleId (non-footwear path)", async () => {
      const product = await findOrCreateProduct({
        title: "Ami Paris Bucket Hat",
        brand: "Ami Paris",
        category: "Headwear > Bucket Hats",
      });

      expect(product.styleId).toBeNull();
      expect(product.title).toBe("Ami Paris Bucket Hat");
      expect(product.brand).toBe("Ami Paris");
    });

    it("deduplicates by title+brand when no styleId", async () => {
      const first = await findOrCreateProduct({
        title: "Ami Paris Bucket Hat",
        brand: "Ami Paris",
        category: "Headwear > Bucket Hats",
      });

      const second = await findOrCreateProduct({
        title: "Ami Paris Bucket Hat",
        brand: "Ami Paris",
        category: "Headwear > Bucket Hats",
      });

      expect(second.id).toBe(first.id);
      expect(await prisma.product.count()).toBe(1);
    });

    it("creates separate products for same title but different brands", async () => {
      await findOrCreateProduct({
        title: "Bucket Hat",
        brand: "Ami Paris",
      });

      await findOrCreateProduct({
        title: "Bucket Hat",
        brand: "Stussy",
      });

      expect(await prisma.product.count()).toBe(2);
    });

    it("creates separate products for same brand but different titles", async () => {
      await findOrCreateProduct({
        title: "Bucket Hat",
        brand: "Ami Paris",
      });

      await findOrCreateProduct({
        title: "Beanie",
        brand: "Ami Paris",
      });

      expect(await prisma.product.count()).toBe(2);
    });

    it("title+brand path finds existing product even if it has a styleId", async () => {
      // Create via styleId path
      const footwear = await findOrCreateProduct({
        styleId: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
      });

      // Look up via title+brand path (no styleId) — finds existing because title+brand match
      const sameProduct = await findOrCreateProduct({
        title: "Nike Dunk Panda",
        brand: "Nike",
      });

      expect(sameProduct.id).toBe(footwear.id);
      expect(await prisma.product.count()).toBe(1);
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
