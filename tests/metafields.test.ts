import { describe, it, expect } from "vitest";
import { deriveProductMetafields } from "~/lib/deriveProductMetafields";

// Shopify metaobject GIDs
const ADULTS = "gid://shopify/Metaobject/210365284470";
const KIDS = "gid://shopify/Metaobject/210365513846";
const MALE = "gid://shopify/Metaobject/210365743222";
const FEMALE = "gid://shopify/Metaobject/210365710454";
const UNISEX = "gid://shopify/Metaobject/210365317238";
const HIGH_TOP = "gid://shopify/Metaobject/210366431350";
const LOW_TOP = "gid://shopify/Metaobject/210366464118";
const SLIP_ON = "gid://shopify/Metaobject/210366496886";
const FASHION = "gid://shopify/Metaobject/210366398582";
const ATHLETIC = "gid://shopify/Metaobject/210366365814";

describe("deriveProductMetafields", () => {
  describe("sneakers — gender + age", () => {
    it("US men's size → Male, Adult", () => {
      const r = deriveProductMetafields("Sneakers", "10", "Air Jordan 1 Retro High", "Air Jordan");
      expect(r.ageGroup).toBe(ADULTS);
      expect(r.targetGender).toBe(MALE);
    });

    it("W suffix → Female, Adult", () => {
      const r = deriveProductMetafields("Sneakers", "8W", "Nike Dunk Low", "Nike");
      expect(r.ageGroup).toBe(ADULTS);
      expect(r.targetGender).toBe(FEMALE);
    });

    it("Y suffix → Unisex, Kids", () => {
      const r = deriveProductMetafields("Sneakers", "5Y", "Jordan 1 (GS)", "Air Jordan");
      expect(r.ageGroup).toBe(KIDS);
      expect(r.targetGender).toBe(UNISEX);
    });

    it("GS in title → Kids", () => {
      const r = deriveProductMetafields("Sneakers", "5", "Air Jordan 1 Retro High OG (GS)", "Air Jordan");
      expect(r.ageGroup).toBe(KIDS);
    });

    it("Women's in title with EU size → Female", () => {
      const r = deriveProductMetafields("Sneakers", "38.5", "Nike Dunk Low Women's", "Nike");
      expect(r.targetGender).toBe(FEMALE);
    });
  });

  describe("sneaker style — height", () => {
    it("Jordan 1 High → High-top + Fashion", () => {
      const r = deriveProductMetafields("Sneakers", "10", "Air Jordan 1 Retro High OG", "Air Jordan");
      expect(r.sneakerStyles).toContain(HIGH_TOP);
      expect(r.sneakerStyles).toContain(FASHION);
    });

    it("Nike Dunk Low → Low-top + Fashion", () => {
      const r = deriveProductMetafields("Sneakers", "10", "Nike Dunk Low Panda", "Nike");
      expect(r.sneakerStyles).toContain(LOW_TOP);
      expect(r.sneakerStyles).toContain(FASHION);
    });

    it("Air Force 1 → Low-top + Fashion", () => {
      const r = deriveProductMetafields("Sneakers", "10", "Nike Air Force 1 Low '07", "Nike");
      expect(r.sneakerStyles).toContain(LOW_TOP);
    });

    it("Air Max → Low-top", () => {
      const r = deriveProductMetafields("Sneakers", "10", "Nike Air Max 90", "Nike");
      expect(r.sneakerStyles).toContain(LOW_TOP);
    });

    it("Yeezy 350 → Low-top + Fashion", () => {
      const r = deriveProductMetafields("Sneakers", "10", "Adidas Yeezy Boost 350 V2", "YEEZY");
      expect(r.sneakerStyles).toContain(LOW_TOP);
      expect(r.sneakerStyles).toContain(FASHION);
    });

    it("Jordan 4 → High-top + Fashion", () => {
      const r = deriveProductMetafields("Sneakers", "10", "Air Jordan 4 Retro Bred", "Air Jordan");
      expect(r.sneakerStyles).toContain(HIGH_TOP);
      expect(r.sneakerStyles).toContain(FASHION);
    });
  });

  describe("sneaker style — athletic vs fashion", () => {
    it("Dior sneaker → Fashion", () => {
      const r = deriveProductMetafields("Sneakers", "42", "Dior B23 High Top", "Dior");
      expect(r.sneakerStyles).toContain(FASHION);
      expect(r.sneakerStyles).not.toContain(ATHLETIC);
    });

    it("Balenciaga → Fashion", () => {
      const r = deriveProductMetafields("Sneakers", "43", "Balenciaga Track Trainer", "Balenciaga");
      expect(r.sneakerStyles).toContain(FASHION);
    });

    it("Asics → Athletic", () => {
      const r = deriveProductMetafields("Sneakers", "10", "Asics Gel-Kayano 14", "Asics");
      expect(r.sneakerStyles).toContain(ATHLETIC);
      expect(r.sneakerStyles).not.toContain(FASHION);
    });

    it("Nike Kobe → Athletic", () => {
      const r = deriveProductMetafields("Sneakers", "10", "Nike Kobe 6 Protro", "Nike");
      expect(r.sneakerStyles).toContain(ATHLETIC);
    });

    it("Nike Pegasus → Athletic", () => {
      const r = deriveProductMetafields("Sneakers", "10", "Nike Pegasus 40", "Nike");
      expect(r.sneakerStyles).toContain(ATHLETIC);
    });
  });

  describe("slides + boots", () => {
    it("Slides → Slip-on only", () => {
      const r = deriveProductMetafields("Slides", "10", "Yeezy Slide Glow Green", "YEEZY");
      expect(r.sneakerStyles).toEqual([SLIP_ON]);
    });

    it("Boots → High-top only", () => {
      const r = deriveProductMetafields("Boots", "10", "Timberland 6-Inch Premium", "Timberland");
      expect(r.sneakerStyles).toEqual([HIGH_TOP]);
    });

    it("Foam Runner → Slip-on", () => {
      const r = deriveProductMetafields("Sneakers", "10", "Adidas Yeezy Foam Runner", "YEEZY");
      expect(r.sneakerStyles).toContain(SLIP_ON);
    });
  });

  describe("non-footwear — no sneaker style", () => {
    it("Hoodie → empty styles", () => {
      const r = deriveProductMetafields("Hoodies", "L", "Supreme Box Logo Hoodie", "Supreme");
      expect(r.sneakerStyles).toEqual([]);
    });

    it("Handbag → empty styles", () => {
      const r = deriveProductMetafields("Handbags", "O/S", "Louis Vuitton Keepall", "Louis Vuitton");
      expect(r.sneakerStyles).toEqual([]);
    });

    it("null category → empty styles", () => {
      const r = deriveProductMetafields(null, "M", "Unknown", null);
      expect(r.sneakerStyles).toEqual([]);
    });
  });
});
