import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { findOrCreateProduct, findOrCreateVariant, detectDuplicateProduct, isSimilarTitle } from "~/services/catalog";

describe("catalog.server", () => {
  describe("findOrCreateProduct", () => {
    it("creates a new product when none exists", async () => {
      const product = await findOrCreateProduct({
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
      });

      expect(product.sku).toBe("DD1391-100");
      expect(product.title).toBe("Nike Dunk Panda");
      expect(product.brand).toBe("Nike");
      expect(product.id).toBeDefined();
    });

    it("returns existing product on second call with same sku", async () => {
      const first = await findOrCreateProduct({
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
      });

      const second = await findOrCreateProduct({
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
      });

      expect(second.id).toBe(first.id);

      // Only 1 product in DB
      const count = await prisma.product.count();
      expect(count).toBe(1);
    });

    it("creates separate products for different skus", async () => {
      await findOrCreateProduct({
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
      });

      await findOrCreateProduct({
        sku: "555088-001",
        title: "Jordan 1 Retro High OG Bred",
        brand: "Jordan",
      });

      const count = await prisma.product.count();
      expect(count).toBe(2);
    });

    it("creates product without sku (non-footwear path)", async () => {
      const product = await findOrCreateProduct({
        title: "Ami Paris Bucket Hat",
        brand: "Ami Paris",
        category: "Headwear > Bucket Hats",
      });

      expect(product.sku).toBeNull();
      expect(product.title).toBe("Ami Paris Bucket Hat");
      expect(product.brand).toBe("Ami Paris");
    });

    it("deduplicates by title+brand when no sku", async () => {
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

    it("title+brand path finds existing product even if it has a sku", async () => {
      // Create via sku path
      const footwear = await findOrCreateProduct({
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
        brand: "Nike",
      });

      // Look up via title+brand path (no sku) — finds existing because title+brand match
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
        sku: "DD1391-100",
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
        sku: "DD1391-100",
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
        sku: "DD1391-100",
        title: "Nike Dunk Panda",
      });

      await findOrCreateVariant({ productId: product.id, size: "9" });
      await findOrCreateVariant({ productId: product.id, size: "10" });

      const count = await prisma.variant.count();
      expect(count).toBe(2);
    });
  });

  describe("isSimilarTitle (matcher heuristics)", () => {
    it("matches partial subset (b30 countdown vs full Dior title)", () => {
      expect(
        isSimilarTitle(
          "b30 countdown sneaker",
          "B30 Countdown Sneaker DIOR Gray Technical Mesh and Dior Gray Technical Fabric DIOR",
        ),
      ).toBe(true);
    });

    it("tolerates a single typo on long words (Levenshtein 1)", () => {
      expect(isSimilarTitle("b30 cuntdown sneaker", "B30 Countdown Sneaker DIOR")).toBe(true);
    });

    it("rejects different model numbers (Air Jordan 1 vs 4)", () => {
      expect(isSimilarTitle("Air Jordan 1 Chicago", "Air Jordan 4 White Cement")).toBe(false);
    });

    it("matches same-number colorways (admin can override)", () => {
      expect(isSimilarTitle("Air Jordan 1 Chicago", "Air Jordan 1 Mocha")).toBe(true);
    });

    it("rejects unrelated titles", () => {
      expect(isSimilarTitle("Adidas Samba", "Air Jordan 1 Chicago")).toBe(false);
    });

    it("rejects when overlap is below 50%", () => {
      expect(isSimilarTitle("totally unrelated brand model", "Air Jordan 1 Chicago Lost and Found")).toBe(false);
    });
  });

  describe("detectDuplicateProduct", () => {
    it("returns kind 'none' when nothing in catalog matches", async () => {
      const result = await detectDuplicateProduct({
        title: "Totally Unique Product XYZ123",
        brand: "NewBrand",
      });
      expect(result.kind).toBe("none");
    });

    it("returns kind 'gtin' when an existing variant has the same barcode", async () => {
      const product = await findOrCreateProduct({ title: "GTIN Owner Sneaker", brand: "TestBrand" });
      await findOrCreateVariant({ productId: product.id, size: "10", gtin: "9999000099991" });

      const result = await detectDuplicateProduct({
        title: "Completely Different Title",
        brand: "OtherBrand",
        gtin: "9999000099991",
      });

      expect(result.kind).toBe("gtin");
      if (result.kind === "gtin") {
        expect(result.existing.product.id).toBe(product.id);
        expect(result.existing.variant.gtin).toBe("9999000099991");
      }
    });

    it("returns kind 'exact-title' when title+brand match case-insensitively", async () => {
      const product = await findOrCreateProduct({ title: "B30 Countdown Sneaker DIOR", brand: "Dior" });

      const result = await detectDuplicateProduct({
        title: "b30 countdown sneaker dior", // lowercase
        brand: "DIOR", // uppercase
      });

      expect(result.kind).toBe("exact-title");
      if (result.kind === "exact-title") expect(result.existing.id).toBe(product.id);
    });

    it("returns kind 'similar' when title is a partial match (not exact)", async () => {
      await findOrCreateProduct({
        title: "B30 Countdown Sneaker DIOR Gray Technical Mesh",
        brand: "Dior",
      });

      const result = await detectDuplicateProduct({
        title: "b30 countdown sneaker", // subset of existing
        brand: "Dior",
      });

      expect(result.kind).toBe("similar");
      if (result.kind === "similar") {
        expect(result.candidates.length).toBeGreaterThan(0);
        expect(result.candidates[0].title).toContain("B30 Countdown Sneaker DIOR");
      }
    });

    it("does NOT match across different model numbers (Air Jordan 1 vs 4)", async () => {
      await findOrCreateProduct({ title: "Air Jordan 4 White Cement", brand: "Air Jordan" });

      const result = await detectDuplicateProduct({
        title: "Air Jordan 1 Chicago",
        brand: "Air Jordan",
      });

      expect(result.kind).toBe("none");
    });
  });
});
