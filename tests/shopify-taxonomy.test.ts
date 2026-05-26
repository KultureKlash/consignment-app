import { describe, it, expect } from "vitest";
import { createMockAdmin } from "./helpers/mock-admin";
import { resolveShopifyTaxonomyId, searchShopifyTaxonomy, isBlockedPath } from "~/services/shopify/taxonomy.server";

describe("shopify-taxonomy.server", () => {
  describe("resolveShopifyTaxonomyId", () => {
    it("returns null for null category", async () => {
      const { admin } = createMockAdmin();
      const result = await resolveShopifyTaxonomyId(admin, null);
      expect(result).toBeNull();
    });

    it("resolves taxonomy ID for known subcategory", async () => {
      const { admin } = createMockAdmin();
      const result = await resolveShopifyTaxonomyId(admin, "Footwear > Sneakers");
      expect(result).toMatch(/gid:\/\/shopify\/TaxonomyCategory\//);
    });

    it("resolves taxonomy ID for main category only", async () => {
      const { admin } = createMockAdmin();
      const result = await resolveShopifyTaxonomyId(admin, "Footwear");
      expect(result).toMatch(/gid:\/\/shopify\/TaxonomyCategory\//);
    });

    it("caches results — second call does not hit API", async () => {
      const { admin, graphql } = createMockAdmin();

      // First call: hits API
      const result1 = await resolveShopifyTaxonomyId(admin, "Apparel > Hoodies");
      expect(result1).toMatch(/gid:\/\/shopify\/TaxonomyCategory\//);

      const callCountAfterFirst = graphql.mock.calls.length;

      // Second call: should use cache
      const result2 = await resolveShopifyTaxonomyId(admin, "Apparel > Hoodies");
      expect(result2).toBe(result1);
      expect(graphql.mock.calls.length).toBe(callCountAfterFirst);
    });

    it("returns null gracefully when API throws", async () => {
      const { admin } = createMockAdmin({ failOn: ["taxonomy"] });
      const result = await resolveShopifyTaxonomyId(admin, "Accessories > Bags");
      expect(result).toBeNull();
    });
  });

  describe("searchShopifyTaxonomy", () => {
    it("returns array of categories from mock", async () => {
      const { admin } = createMockAdmin();
      const results = await searchShopifyTaxonomy(admin, "sneakers");
      expect(results).toHaveLength(1);
      expect(results[0].id).toMatch(/gid:\/\/shopify\/TaxonomyCategory\//);
      expect(results[0].fullName).toBeDefined();
    });
  });

  describe("isBlockedPath (kids/baby filter)", () => {
    // The Shopify taxonomy returns Baby & Toddler categories FIRST for many
    // bare apparel keywords. resolveShopifyTaxonomyId uses isBlockedPath to
    // skip those — Konsign is an adult marketplace, never want a listing
    // tagged into the kids subtree.
    it("blocks Baby & Toddler categories", () => {
      expect(isBlockedPath("Apparel & Accessories > Clothing > Baby & Toddler > Baby & Toddler Bottoms > Jeans")).toBe(true);
      expect(isBlockedPath("Apparel & Accessories > Clothing > Baby & Toddler T-Shirts")).toBe(true);
    });

    it("blocks Children / Kids / Infant / Juniors", () => {
      expect(isBlockedPath("Apparel > Children's Clothing > Tops")).toBe(true);
      expect(isBlockedPath("Apparel > Kids Sneakers")).toBe(true);
      expect(isBlockedPath("Apparel > Infant Wear")).toBe(true);
      expect(isBlockedPath("Apparel > Juniors > Dresses")).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(isBlockedPath("APPAREL > BABY & TODDLER > T-SHIRTS")).toBe(true);
      expect(isBlockedPath("apparel > baby & toddler > t-shirts")).toBe(true);
    });

    it("accepts adult Apparel & Accessories paths", () => {
      expect(isBlockedPath("Apparel & Accessories > Clothing > Pants > Jeans")).toBe(false);
      expect(isBlockedPath("Apparel & Accessories > Clothing > Tops & Tees")).toBe(false);
      expect(isBlockedPath("Apparel & Accessories > Shoes > Athletic Shoes")).toBe(false);
    });
  });
});
