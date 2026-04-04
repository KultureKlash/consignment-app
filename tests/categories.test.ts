import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import { createListing } from "~/services/listings.server";
import { findOrCreateProduct } from "~/services/catalog.server";
import {
  autoSuggest,
  buildCategory,
  parseCategory,
  isFootwear,
  abbreviateBrand,
  abbreviateSubcategory,
  generateBarcode,
  CATEGORIES,
  MAIN_CATEGORIES,
} from "~/lib/categories";

describe("categories", () => {
  describe("autoSuggest", () => {
    it("detects Nike Dunk as Footwear > Sneakers by Nike", () => {
      const result = autoSuggest("Nike Dunk Panda");
      expect(result.brand).toBe("Nike");
      expect(result.mainCategory).toBe("Footwear");
      expect(result.subCategory).toBe("Sneakers");
    });

    it("detects Air Jordan as Air Jordan Footwear > Sneakers", () => {
      const result = autoSuggest("Air Jordan 1 Retro High OG Bred");
      expect(result.brand).toBe("Air Jordan");
      expect(result.mainCategory).toBe("Footwear");
      expect(result.subCategory).toBe("Sneakers");
    });

    it("detects Yeezy as YEEZY Footwear > Sneakers", () => {
      const result = autoSuggest("Yeezy Boost 350 V2 Zebra");
      expect(result.brand).toBe("YEEZY");
      expect(result.mainCategory).toBe("Footwear");
      expect(result.subCategory).toBe("Sneakers");
    });

    it("detects Yeezy Slide as YEEZY Footwear", () => {
      const result = autoSuggest("Yeezy Slide Onyx");
      expect(result.brand).toBe("YEEZY");
      expect(result.mainCategory).toBe("Footwear");
    });

    it("detects New Balance 550", () => {
      const result = autoSuggest("NB 550 White Green");
      expect(result.brand).toBe("New Balance");
      expect(result.mainCategory).toBe("Footwear");
      expect(result.subCategory).toBe("Sneakers");
    });

    it("detects UGG boots", () => {
      const result = autoSuggest("UGG Tasman Chestnut");
      expect(result.brand).toBe("UGG");
      expect(result.mainCategory).toBe("Footwear");
      expect(result.subCategory).toBe("Boots");
    });

    it("detects hoodie as Apparel", () => {
      const result = autoSuggest("Essentials Hoodie Black");
      expect(result.brand).toBe("Fear of God Essentials");
      expect(result.mainCategory).toBe("Apparel");
      expect(result.subCategory).toBe("Hoodies");
    });

    it("detects fitted hat as Headwear", () => {
      const result = autoSuggest("New Era 59Fifty Yankees Fitted");
      expect(result.brand).toBe("New Era");
      expect(result.mainCategory).toBe("Headwear");
      expect(result.subCategory).toBe("Fitted Hats");
    });

    it("detects bag as Accessories", () => {
      const result = autoSuggest("Supreme Shoulder Bag Red");
      expect(result.brand).toBe("Supreme");
      expect(result.mainCategory).toBe("Accessories");
      expect(result.subCategory).toBe("Handbags");
    });

    it("returns empty for unrecognized title", () => {
      const result = autoSuggest("Random Item XYZ");
      expect(result.brand).toBeUndefined();
      expect(result.mainCategory).toBeUndefined();
      expect(result.subCategory).toBeUndefined();
    });

    it("is case-insensitive", () => {
      const result = autoSuggest("nike dunk low retro");
      expect(result.brand).toBe("Nike");
      expect(result.mainCategory).toBe("Footwear");
    });

    it("detects Adidas Samba", () => {
      const result = autoSuggest("Adidas Samba OG White");
      expect(result.brand).toBe("Adidas");
      expect(result.mainCategory).toBe("Footwear");
      expect(result.subCategory).toBe("Sneakers");
    });

    it("detects Birkenstock sandals", () => {
      const result = autoSuggest("Birkenstock Boston Clog Taupe");
      expect(result.brand).toBe("Birkenstock");
      expect(result.mainCategory).toBe("Footwear");
    });

    it("detects Timberland boots", () => {
      const result = autoSuggest("Timberland 6-inch Premium Boot Wheat");
      expect(result.brand).toBe("Timberland");
      expect(result.mainCategory).toBe("Footwear");
      expect(result.subCategory).toBe("Boots");
    });
  });

  describe("buildCategory / parseCategory", () => {
    it("builds main + sub (returns sub only)", () => {
      expect(buildCategory("Footwear", "Sneakers")).toBe("Sneakers");
    });

    it("builds main only", () => {
      expect(buildCategory("Apparel")).toBe("Apparel");
    });

    it("parses legacy format (main > sub)", () => {
      const { main, sub } = parseCategory("Footwear > Sneakers");
      expect(main).toBe("Footwear");
      expect(sub).toBe("Sneakers");
    });

    it("parses new format (sub only) with reverse lookup", () => {
      const { main, sub } = parseCategory("Sneakers");
      expect(main).toBe("Footwear");
      expect(sub).toBe("Sneakers");
    });

    it("parses main category name", () => {
      const { main, sub } = parseCategory("Apparel");
      expect(main).toBe("Apparel");
      expect(sub).toBeUndefined();
    });
  });

  describe("isFootwear", () => {
    it("returns true for legacy 'Footwear > Sneakers'", () => {
      expect(isFootwear("Footwear > Sneakers")).toBe(true);
    });

    it("returns true for 'Footwear'", () => {
      expect(isFootwear("Footwear")).toBe(true);
    });

    it("returns true for new format 'Sneakers'", () => {
      expect(isFootwear("Sneakers")).toBe(true);
    });

    it("returns true for 'Boots'", () => {
      expect(isFootwear("Boots")).toBe(true);
    });

    it("returns false for 'T-Shirts'", () => {
      expect(isFootwear("T-Shirts")).toBe(false);
    });

    it("returns false for legacy 'Apparel > T-Shirts'", () => {
      expect(isFootwear("Apparel > T-Shirts")).toBe(false);
    });

    it("returns false for null/undefined", () => {
      expect(isFootwear(null)).toBe(false);
      expect(isFootwear(undefined)).toBe(false);
    });
  });

  describe("abbreviateBrand (algorithmic)", () => {
    it("abbreviates multi-word brands to initials", () => {
      expect(abbreviateBrand("Fear of God")).toBe("FOG");
      expect(abbreviateBrand("Louis Vuitton")).toBe("LV");
      expect(abbreviateBrand("Gallery Dept")).toBe("GD");
      expect(abbreviateBrand("New Balance")).toBe("NB");
      expect(abbreviateBrand("Maison Margiela")).toBe("MM");
      expect(abbreviateBrand("A Bathing Ape")).toBe("ABA");
    });

    it("abbreviates single-word brands to first 3 chars uppercase", () => {
      expect(abbreviateBrand("Nike")).toBe("NIK");
      expect(abbreviateBrand("Adidas")).toBe("ADI");
      expect(abbreviateBrand("Supreme")).toBe("SUP");
      expect(abbreviateBrand("Prada")).toBe("PRA");
      expect(abbreviateBrand("Zara")).toBe("ZAR");
      expect(abbreviateBrand("UGG")).toBe("UGG");
    });

    it("returns XX for undefined/empty", () => {
      expect(abbreviateBrand(undefined)).toBe("XX");
      expect(abbreviateBrand("")).toBe("XX");
    });

    it("caps initials at 4 chars", () => {
      expect(abbreviateBrand("A Very Long Brand Name")).toBe("AVLB");
    });
  });

  describe("abbreviateSubcategory", () => {
    it("abbreviates known subcategories", () => {
      expect(abbreviateSubcategory("T-Shirts")).toBe("TEE");
      expect(abbreviateSubcategory("Hoodies")).toBe("HOD");
      expect(abbreviateSubcategory("Sneakers")).toBe("SNK");
      expect(abbreviateSubcategory("Fitted Hats")).toBe("FIT");
      expect(abbreviateSubcategory("Puffer Jackets")).toBe("PFJ");
      expect(abbreviateSubcategory("Jeans")).toBe("JNS");
      expect(abbreviateSubcategory("Varsity Jackets")).toBe("VJK");
    });

    it("abbreviates unknown subcategories to first 3 chars", () => {
      expect(abbreviateSubcategory("Cloaks")).toBe("CLO");
    });

    it("returns GEN for undefined", () => {
      expect(abbreviateSubcategory(undefined)).toBe("GEN");
    });
  });

  describe("generateBarcode", () => {
    it("generates uppercase barcode with correct prefix", () => {
      const barcode = generateBarcode("Gallery Dept", "T-Shirts", "M");
      expect(barcode).toMatch(/^GD-TEE-M-[A-Z0-9]{8}$/);
    });

    it("handles single-word brand", () => {
      const barcode = generateBarcode("Prada", "Bags", "OS");
      expect(barcode).toMatch(/^PRA-BAG-OS-[A-Z0-9]{8}$/);
    });

    it("handles no brand", () => {
      const barcode = generateBarcode(undefined, "Hoodies", "L");
      expect(barcode).toMatch(/^XX-HOD-L-[A-Z0-9]{8}$/);
    });

    it("handles no subcategory", () => {
      const barcode = generateBarcode("Nike", undefined, "9");
      expect(barcode).toMatch(/^NIK-GEN-9-[A-Z0-9]{8}$/);
    });

    it("uppercases size and strips spaces", () => {
      const barcode = generateBarcode("Nike", "T-Shirts", "x large");
      expect(barcode).toMatch(/^NIK-TEE-XLARGE-[A-Z0-9]{8}$/);
    });

    it("generates unique barcodes on repeated calls", () => {
      const a = generateBarcode("Supreme", "Hoodies", "L");
      const b = generateBarcode("Supreme", "Hoodies", "L");
      expect(a).not.toBe(b);
      expect(a).toMatch(/^SUP-HOD-L-/);
      expect(b).toMatch(/^SUP-HOD-L-/);
    });
  });

  describe("CATEGORIES structure", () => {
    it("has all expected main categories", () => {
      expect(MAIN_CATEGORIES).toEqual(["Footwear", "Apparel", "Accessories", "Headwear"]);
    });

    it("each main category has subcategories", () => {
      for (const main of MAIN_CATEGORIES) {
        expect(CATEGORIES[main].length).toBeGreaterThan(0);
      }
    });
  });

  describe("catalog service — footwear path (with styleId)", () => {
    it("saves category on product creation", async () => {
      const product = await findOrCreateProduct({
        styleId: "CAT-TEST-001",
        title: "Test Product",
        brand: "TestBrand",
        category: "Footwear > Sneakers",
      });

      expect(product.category).toBe("Footwear > Sneakers");
    });

    it("existing product keeps its category", async () => {
      await findOrCreateProduct({
        styleId: "CAT-TEST-002",
        title: "Test Product",
        category: "Apparel > Hoodies",
      });

      const product = await findOrCreateProduct({
        styleId: "CAT-TEST-002",
        title: "Test Product",
        category: "Footwear > Boots",
      });

      expect(product.category).toBe("Apparel > Hoodies");
    });
  });

  describe("catalog service — non-footwear path (no styleId)", () => {
    it("creates product without styleId", async () => {
      const product = await findOrCreateProduct({
        title: "Gallery Dept Le Bar Tee",
        brand: "Gallery Dept",
        category: "Apparel > T-Shirts",
      });

      expect(product.styleId).toBeNull();
      expect(product.title).toBe("Gallery Dept Le Bar Tee");
      expect(product.brand).toBe("Gallery Dept");
      expect(product.category).toBe("Apparel > T-Shirts");
    });

    it("finds existing non-footwear product by title + brand", async () => {
      const first = await findOrCreateProduct({
        title: "Supreme Box Logo Hoodie",
        brand: "Supreme",
        category: "Apparel > Hoodies",
      });

      const second = await findOrCreateProduct({
        title: "Supreme Box Logo Hoodie",
        brand: "Supreme",
        category: "Apparel > Hoodies",
      });

      expect(second.id).toBe(first.id);
      expect(await prisma.product.count()).toBe(1);
    });

    it("creates separate products for same title different brand", async () => {
      await findOrCreateProduct({
        title: "Classic Tee Black",
        brand: "Supreme",
        category: "Apparel > T-Shirts",
      });

      await findOrCreateProduct({
        title: "Classic Tee Black",
        brand: "Stussy",
        category: "Apparel > T-Shirts",
      });

      expect(await prisma.product.count()).toBe(2);
    });
  });

  describe("listing service — footwear with category", () => {
    it("passes category through to product", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        styleId: "CAT-LST-001",
        title: "Nike Air Max 90",
        brand: "Nike",
        category: "Footwear > Sneakers",
        size: "10",
        gtin: "TEST-GTIN-CAT",
        price: 200,
        consignorId: consignor.id,
      });

      const product = await prisma.product.findUnique({ where: { styleId: "CAT-LST-001" } });
      expect(product?.category).toBe("Footwear > Sneakers");
      expect(product?.brand).toBe("Nike");
    });
  });

  describe("listing service — non-footwear auto-barcode", () => {
    it("auto-generates uppercase barcode for non-footwear listing", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        title: "Gallery Dept Le Bar Tee",
        brand: "Gallery Dept",
        category: "Apparel > T-Shirts",
        size: "M",
        price: 280,
        consignorId: consignor.id,
      });

      const variant = await prisma.variant.findFirst();
      expect(variant?.gtin).toBeTruthy();
      expect(variant!.gtin).toMatch(/^GD-TEE-M-[A-Z0-9]{8}$/);
    });

    it("does not overwrite existing GTIN on footwear", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        styleId: "FW-BARCODE-001",
        title: "Nike Dunk Panda",
        brand: "Nike",
        category: "Footwear > Sneakers",
        size: "9",
        gtin: "194956806653",
        price: 350,
        consignorId: consignor.id,
      });

      const variant = await prisma.variant.findFirst();
      expect(variant?.gtin).toBe("194956806653");
    });

    it("works without category (defaults to no auto-barcode)", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        styleId: "NO-CAT-001",
        title: "Unknown Product",
        size: "OS",
        gtin: "MANUAL-GTIN",
        price: 100,
        consignorId: consignor.id,
      });

      const product = await prisma.product.findUnique({ where: { styleId: "NO-CAT-001" } });
      expect(product?.category).toBeNull();
      const variant = await prisma.variant.findFirst();
      expect(variant?.gtin).toBe("MANUAL-GTIN");
    });

    it("auto-barcode includes correct brand abbreviation and subcategory", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();

      await createListing({
        admin,
        title: "Supreme Box Logo Hoodie Black",
        brand: "Supreme",
        category: "Apparel > Hoodies",
        size: "L",
        price: 600,
        consignorId: consignor.id,
      });

      const variant = await prisma.variant.findFirst();
      expect(variant!.gtin).toMatch(/^SUP-HOD-L-[A-Z0-9]{8}$/);
    });
  });
});
