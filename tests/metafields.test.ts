import { describe, it, expect } from "vitest";
import { deriveProductMetafields } from "~/lib/deriveProductMetafields";

// Expected GIDs from Shopify metaobjects
const ADULTS = "gid://shopify/Metaobject/210365284470";
const KIDS = "gid://shopify/Metaobject/210365513846";
const MALE = "gid://shopify/Metaobject/210365743222";
const FEMALE = "gid://shopify/Metaobject/210365710454";
const UNISEX = "gid://shopify/Metaobject/210365317238";

describe("deriveProductMetafields", () => {
  describe("sneakers — size-based gender", () => {
    it("US men's size → Male, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "10", "Air Jordan 1 Retro High")).toEqual({
        ageGroup: ADULTS, targetGender: MALE,
      });
    });

    it("US half size → Male, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "10.5", "Nike Dunk Low")).toEqual({
        ageGroup: ADULTS, targetGender: MALE,
      });
    });

    it("EU size → Male, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "42", "Jordan 1 Retro High OG")).toEqual({
        ageGroup: ADULTS, targetGender: MALE,
      });
    });

    it("EU half size → Male, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "44.5", "Nike Air Max 90")).toEqual({
        ageGroup: ADULTS, targetGender: MALE,
      });
    });

    it("Women's size (W suffix) → Female, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "8W", "Nike Dunk Low")).toEqual({
        ageGroup: ADULTS, targetGender: FEMALE,
      });
    });

    it("Women's half size (W suffix) → Female, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "10.5W", "Nike Dunk Low")).toEqual({
        ageGroup: ADULTS, targetGender: FEMALE,
      });
    });

    it("Youth size (Y suffix) → Unisex, Kids", () => {
      expect(deriveProductMetafields("Sneakers", "5Y", "Jordan 1 Retro High OG (GS)")).toEqual({
        ageGroup: KIDS, targetGender: UNISEX,
      });
    });

    it("Youth half size (Y suffix) → Unisex, Kids", () => {
      expect(deriveProductMetafields("Sneakers", "6.5Y", "Nike Dunk Low")).toEqual({
        ageGroup: KIDS, targetGender: UNISEX,
      });
    });
  });

  describe("sneakers — title-based fallback", () => {
    it("Women's in title with EU size → Female, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "38.5", "Nike Dunk Low Women's")).toEqual({
        ageGroup: ADULTS, targetGender: FEMALE,
      });
    });

    it("Womens (no apostrophe) in title → Female, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "39", "Nike Air Max 90 Womens")).toEqual({
        ageGroup: ADULTS, targetGender: FEMALE,
      });
    });

    it("GS in title → Unisex, Kids", () => {
      expect(deriveProductMetafields("Sneakers", "5", "Air Jordan 1 Retro High OG (GS)")).toEqual({
        ageGroup: KIDS, targetGender: UNISEX,
      });
    });

    it("Grade School in title → Unisex, Kids", () => {
      expect(deriveProductMetafields("Sneakers", "6", "Nike Dunk Low Grade School")).toEqual({
        ageGroup: KIDS, targetGender: UNISEX,
      });
    });

    it("TD in title → Unisex, Kids", () => {
      expect(deriveProductMetafields("Sneakers", "8C", "Nike Air Force 1 TD")).toEqual({
        ageGroup: KIDS, targetGender: UNISEX,
      });
    });

    it("PS in title → Unisex, Kids", () => {
      expect(deriveProductMetafields("Sneakers", "1", "Jordan 4 Retro PS")).toEqual({
        ageGroup: KIDS, targetGender: UNISEX,
      });
    });

    it("Kids in title → Unisex, Kids", () => {
      expect(deriveProductMetafields("Sneakers", "12", "Nike Air Max 90 Kids")).toEqual({
        ageGroup: KIDS, targetGender: UNISEX,
      });
    });
  });

  describe("other footwear", () => {
    it("Slides → Unisex, Adult", () => {
      expect(deriveProductMetafields("Slides", "10", "Yeezy Slide Glow Green")).toEqual({
        ageGroup: ADULTS, targetGender: UNISEX,
      });
    });

    it("Boots → Unisex, Adult", () => {
      expect(deriveProductMetafields("Boots", "10", "Timberland 6-Inch Premium")).toEqual({
        ageGroup: ADULTS, targetGender: UNISEX,
      });
    });
  });

  describe("non-footwear", () => {
    it("Hoodie → Unisex, Adult", () => {
      expect(deriveProductMetafields("Hoodies", "L", "Supreme Box Logo Hoodie")).toEqual({
        ageGroup: ADULTS, targetGender: UNISEX,
      });
    });

    it("Handbags → Female, Adult", () => {
      expect(deriveProductMetafields("Handbags", "O/S", "Louis Vuitton Keepall 55")).toEqual({
        ageGroup: ADULTS, targetGender: FEMALE,
      });
    });

    it("Caps → Unisex, Adult", () => {
      expect(deriveProductMetafields("Caps", "O/S", "Chrome Hearts Trucker Hat")).toEqual({
        ageGroup: ADULTS, targetGender: UNISEX,
      });
    });
  });

  describe("edge cases", () => {
    it("null category → Unisex, Adult", () => {
      expect(deriveProductMetafields(null, "M", "Unknown Product")).toEqual({
        ageGroup: ADULTS, targetGender: UNISEX,
      });
    });

    it("W size overrides non-womens title", () => {
      expect(deriveProductMetafields("Sneakers", "9W", "Air Jordan 1 Retro High")).toEqual({
        ageGroup: ADULTS, targetGender: FEMALE,
      });
    });

    it("Y size overrides non-kids title", () => {
      expect(deriveProductMetafields("Sneakers", "5Y", "Air Jordan 1 Retro High")).toEqual({
        ageGroup: KIDS, targetGender: UNISEX,
      });
    });
  });
});
