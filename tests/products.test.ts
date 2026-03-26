import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import {
  queryProducts,
  getProductDetail,
  updateProduct,
  updateVariantGtin,
  mergeProducts,
} from "~/services/products.server";

// ── Helpers ────────────────────────────────────────────

async function createProduct(overrides: { title?: string; brand?: string; category?: string; styleId?: string } = {}) {
  return prisma.product.create({
    data: {
      title: overrides.title ?? "Test Product",
      brand: overrides.brand ?? "Test Brand",
      category: overrides.category ?? "Footwear > Sneakers",
      styleId: overrides.styleId,
    },
  });
}

async function createVariant(productId: string, size: string, gtin?: string) {
  return prisma.variant.create({
    data: { productId, size, gtin: gtin ?? null },
  });
}

// ── queryProducts ──────────────────────────────────────

describe("products.server — queryProducts", () => {
  it("returns paginated products", async () => {
    await createProduct({ title: "Jordan 1" });
    await createProduct({ title: "Dunk Low" });
    await createProduct({ title: "Air Max" });

    const result = await queryProducts({ page: 1, limit: 2 });
    expect(result.products).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.totalPages).toBe(2);

    const page2 = await queryProducts({ page: 2, limit: 2 });
    expect(page2.products).toHaveLength(1);
  });

  it("searches by title", async () => {
    await createProduct({ title: "Jordan 1 Retro" });
    await createProduct({ title: "Dunk Low" });

    const result = await queryProducts({ search: "Jordan" });
    expect(result.products).toHaveLength(1);
    expect(result.products[0].title).toBe("Jordan 1 Retro");
  });

  it("searches by brand", async () => {
    await createProduct({ title: "Shoe A", brand: "Nike" });
    await createProduct({ title: "Shoe B", brand: "Adidas" });

    const result = await queryProducts({ search: "Nike" });
    expect(result.products).toHaveLength(1);
    expect(result.products[0].brand).toBe("Nike");
  });

  it("searches by styleId", async () => {
    await createProduct({ title: "Shoe A", styleId: "DQ8423-100" });
    await createProduct({ title: "Shoe B", styleId: "FJ4188-100" });

    const result = await queryProducts({ search: "DQ8423" });
    expect(result.products).toHaveLength(1);
  });

  it("filters by category", async () => {
    await createProduct({ title: "Sneaker", category: "Footwear > Sneakers" });
    await createProduct({ title: "Hat", category: "Headwear > Caps" });

    const result = await queryProducts({ category: "Footwear" });
    expect(result.products).toHaveLength(1);
    expect(result.products[0].title).toBe("Sneaker");
  });

  it("includes variant count and active listings count", async () => {
    const product = await createProduct({ title: "Test Shoe" });
    const v1 = await createVariant(product.id, "9");
    const v2 = await createVariant(product.id, "10");
    const consignor = await createTestConsignor();

    await prisma.listing.createMany({
      data: [
        { consignorId: consignor.id, variantId: v1.id, price: 100, status: "active" },
        { consignorId: consignor.id, variantId: v1.id, price: 120, status: "active" },
        { consignorId: consignor.id, variantId: v2.id, price: 150, status: "sold" },
      ],
    });

    const result = await queryProducts();
    const p = result.products[0];
    expect(p.variantCount).toBe(2);
    expect(p.activeListings).toBe(2);
  });

  it("returns empty for no match", async () => {
    await createProduct({ title: "Shoe" });
    const result = await queryProducts({ search: "nonexistent" });
    expect(result.products).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

// ── getProductDetail ───────────────────────────────────

describe("products.server — getProductDetail", () => {
  it("returns product with variants and active listing counts", async () => {
    const product = await createProduct({ title: "Jordan 1" });
    const v = await createVariant(product.id, "10", "123456789");
    const consignor = await createTestConsignor();

    await prisma.listing.createMany({
      data: [
        { consignorId: consignor.id, variantId: v.id, price: 100, status: "active" },
        { consignorId: consignor.id, variantId: v.id, price: 120, status: "sold" },
      ],
    });

    const detail = await getProductDetail(product.id);
    expect(detail.title).toBe("Jordan 1");
    expect(detail.variants).toHaveLength(1);
    expect(detail.variants[0].activeListings).toBe(1);
    expect(detail.variants[0].gtin).toBe("123456789");
  });

  it("throws for non-existent product", async () => {
    await expect(getProductDetail("nonexistent")).rejects.toThrow("Product not found");
  });
});

// ── updateProduct ──────────────────────────────────────

describe("products.server — updateProduct", () => {
  it("updates title and brand", async () => {
    const product = await createProduct({ title: "Old Title", brand: "Old Brand" });
    const updated = await updateProduct(product.id, { title: "New Title", brand: "New Brand" });
    expect(updated.title).toBe("New Title");
    expect(updated.brand).toBe("New Brand");
  });

  it("updates category", async () => {
    const product = await createProduct({ category: "Footwear > Sneakers" });
    const updated = await updateProduct(product.id, { category: "Headwear > Caps" });
    expect(updated.category).toBe("Headwear > Caps");
  });

  it("updates styleId", async () => {
    const product = await createProduct();
    const updated = await updateProduct(product.id, { styleId: "NEW-123" });
    expect(updated.styleId).toBe("NEW-123");
  });

  it("clears styleId when set to null", async () => {
    const product = await createProduct({ styleId: "OLD-123" });
    const updated = await updateProduct(product.id, { styleId: null });
    expect(updated.styleId).toBeNull();
  });

  it("throws for duplicate styleId", async () => {
    await createProduct({ title: "A", styleId: "TAKEN-123" });
    const product = await createProduct({ title: "B" });

    await expect(
      updateProduct(product.id, { styleId: "TAKEN-123" }),
    ).rejects.toThrow("Style ID already in use");
  });

  it("allows keeping the same styleId", async () => {
    const product = await createProduct({ styleId: "SAME-123" });
    const updated = await updateProduct(product.id, { styleId: "SAME-123", title: "Updated" });
    expect(updated.title).toBe("Updated");
    expect(updated.styleId).toBe("SAME-123");
  });

  it("throws for non-existent product", async () => {
    await expect(updateProduct("nonexistent", { title: "X" })).rejects.toThrow("Product not found");
  });
});

// ── updateVariantGtin ──────────────────────────────────

describe("products.server — updateVariantGtin", () => {
  it("updates GTIN", async () => {
    const product = await createProduct();
    const variant = await createVariant(product.id, "10");
    const updated = await updateVariantGtin(variant.id, "999888777");
    expect(updated.gtin).toBe("999888777");
  });

  it("clears GTIN", async () => {
    const product = await createProduct();
    const variant = await createVariant(product.id, "10", "old-gtin");
    const updated = await updateVariantGtin(variant.id, null);
    expect(updated.gtin).toBeNull();
  });

  it("throws for duplicate GTIN", async () => {
    const product = await createProduct();
    await createVariant(product.id, "9", "TAKEN-GTIN");
    const v2 = await createVariant(product.id, "10");

    await expect(updateVariantGtin(v2.id, "TAKEN-GTIN")).rejects.toThrow("GTIN already in use");
  });

  it("throws for non-existent variant", async () => {
    await expect(updateVariantGtin("nonexistent", "123")).rejects.toThrow("Variant not found");
  });
});

// ── mergeProducts ──────────────────────────────────────

describe("products.server — mergeProducts", () => {
  it("merges source into target — re-parents unique sizes", async () => {
    const target = await createProduct({ title: "Target" });
    await createVariant(target.id, "9");

    const source = await createProduct({ title: "Source" });
    await createVariant(source.id, "10");

    const result = await mergeProducts(target.id, source.id);

    // Source product should be deleted
    const deletedProduct = await prisma.product.findUnique({ where: { id: source.id } });
    expect(deletedProduct).toBeNull();

    // Target should now have both sizes
    const variants = await prisma.variant.findMany({ where: { productId: target.id } });
    expect(variants).toHaveLength(2);
    expect(variants.map((v) => v.size).sort()).toEqual(["10", "9"]);
  });

  it("merges source into target — moves listings when sizes overlap", async () => {
    const consignor = await createTestConsignor();

    const target = await createProduct({ title: "Target" });
    const targetV = await createVariant(target.id, "10");

    const source = await createProduct({ title: "Source" });
    const sourceV = await createVariant(source.id, "10");

    // Create listings on source variant
    await prisma.listing.createMany({
      data: [
        { consignorId: consignor.id, variantId: sourceV.id, price: 100, status: "active" },
        { consignorId: consignor.id, variantId: sourceV.id, price: 120, status: "active" },
      ],
    });

    await mergeProducts(target.id, source.id);

    // Source variant should be deleted (same size as target)
    const deletedVariant = await prisma.variant.findUnique({ where: { id: sourceV.id } });
    expect(deletedVariant).toBeNull();

    // Listings should now belong to target variant
    const listings = await prisma.listing.findMany({ where: { variantId: targetV.id } });
    expect(listings).toHaveLength(2);
  });

  it("handles mixed overlap and unique sizes", async () => {
    const consignor = await createTestConsignor();

    const target = await createProduct({ title: "Target" });
    await createVariant(target.id, "9");

    const source = await createProduct({ title: "Source" });
    await createVariant(source.id, "9"); // overlaps
    await createVariant(source.id, "11"); // unique

    await mergeProducts(target.id, source.id);

    const variants = await prisma.variant.findMany({ where: { productId: target.id } });
    expect(variants).toHaveLength(2);
    expect(variants.map((v) => v.size).sort()).toEqual(["11", "9"]);
  });

  it("throws when merging into itself", async () => {
    const product = await createProduct();
    await expect(mergeProducts(product.id, product.id)).rejects.toThrow("Cannot merge a product into itself");
  });

  it("throws for non-existent target", async () => {
    const source = await createProduct();
    await expect(mergeProducts("nonexistent", source.id)).rejects.toThrow("Target product not found");
  });

  it("throws for non-existent source", async () => {
    const target = await createProduct();
    await expect(mergeProducts(target.id, "nonexistent")).rejects.toThrow("Source product not found");
  });

  it("blocks cross-category merge", async () => {
    const target = await createProduct({ title: "Sneaker", category: "Footwear > Sneakers" });
    const source = await createProduct({ title: "Hat", category: "Headwear > Caps" });

    await expect(mergeProducts(target.id, source.id)).rejects.toThrow("Cannot merge across categories");
  });

  it("allows same-category merge", async () => {
    const target = await createProduct({ title: "Jordan 1", category: "Footwear > Sneakers" });
    await createVariant(target.id, "9");
    const source = await createProduct({ title: "Jordan 1 Retro", category: "Footwear > Boots" });
    await createVariant(source.id, "10");

    const result = await mergeProducts(target.id, source.id);
    const variants = await prisma.variant.findMany({ where: { productId: target.id } });
    expect(variants).toHaveLength(2);
  });

  it("warns on brand mismatch (no force)", async () => {
    const target = await createProduct({ title: "Shoe A", brand: "Nike", category: "Footwear" });
    const source = await createProduct({ title: "Shoe B", brand: "Adidas", category: "Footwear" });

    await expect(mergeProducts(target.id, source.id)).rejects.toThrow("Brand mismatch");
  });

  it("allows brand mismatch with force flag", async () => {
    const target = await createProduct({ title: "Shoe A", brand: "Nike", category: "Footwear" });
    await createVariant(target.id, "9");
    const source = await createProduct({ title: "Shoe B", brand: "Adidas", category: "Footwear" });
    await createVariant(source.id, "10");

    const result = await mergeProducts(target.id, source.id, { force: true });
    const variants = await prisma.variant.findMany({ where: { productId: target.id } });
    expect(variants).toHaveLength(2);
  });

  it("skips brand check when one product has no brand", async () => {
    const target = await createProduct({ title: "Shoe A", brand: "Nike", category: "Footwear" });
    await createVariant(target.id, "9");
    const source = await prisma.product.create({ data: { title: "Shoe B", category: "Footwear" } });
    await createVariant(source.id, "10");

    // Should NOT throw — brand check skipped when source has no brand
    const result = await mergeProducts(target.id, source.id);
    const variants = await prisma.variant.findMany({ where: { productId: target.id } });
    expect(variants).toHaveLength(2);
  });

  it("skips category check when one product has no category", async () => {
    const target = await createProduct({ title: "A", category: "Footwear" });
    await createVariant(target.id, "9");
    const source = await createProduct({ title: "B" }); // no category
    await createVariant(source.id, "10");

    const result = await mergeProducts(target.id, source.id);
    const variants = await prisma.variant.findMany({ where: { productId: target.id } });
    expect(variants).toHaveLength(2);
  });
});
