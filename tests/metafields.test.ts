import { describe, it, expect } from "vitest";
import { deriveProductMetafields } from "~/lib/deriveProductMetafields";

describe("deriveProductMetafields", () => {
  describe("sneakers — size-based gender", () => {
    it("US men's size → Male, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "10", "Air Jordan 1 Retro High")).toEqual({
        ageGroup: "adult",
        targetGender: "male",
      });
    });

    it("US half size → Male, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "10.5", "Nike Dunk Low")).toEqual({
        ageGroup: "adult",
        targetGender: "male",
      });
    });

    it("EU size → Male, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "42", "Jordan 1 Retro High OG")).toEqual({
        ageGroup: "adult",
        targetGender: "male",
      });
    });

    it("EU half size → Male, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "44.5", "Nike Air Max 90")).toEqual({
        ageGroup: "adult",
        targetGender: "male",
      });
    });

    it("Women's size (W suffix) → Female, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "8W", "Nike Dunk Low")).toEqual({
        ageGroup: "adult",
        targetGender: "female",
      });
    });

    it("Women's half size (W suffix) → Female, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "10.5W", "Nike Dunk Low")).toEqual({
        ageGroup: "adult",
        targetGender: "female",
      });
    });

    it("Youth size (Y suffix) → Unisex, Kids", () => {
      expect(deriveProductMetafields("Sneakers", "5Y", "Jordan 1 Retro High OG (GS)")).toEqual({
        ageGroup: "kids",
        targetGender: "unisex",
      });
    });

    it("Youth half size (Y suffix) → Unisex, Kids", () => {
      expect(deriveProductMetafields("Sneakers", "6.5Y", "Nike Dunk Low")).toEqual({
        ageGroup: "kids",
        targetGender: "unisex",
      });
    });
  });

  describe("sneakers — title-based fallback", () => {
    it("Women's in title with EU size → Female, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "38.5", "Nike Dunk Low Women's")).toEqual({
        ageGroup: "adult",
        targetGender: "female",
      });
    });

    it("Womens (no apostrophe) in title → Female, Adult", () => {
      expect(deriveProductMetafields("Sneakers", "39", "Nike Air Max 90 Womens")).toEqual({
        ageGroup: "adult",
        targetGender: "female",
      });
    });

    it("GS in title → Unisex, Kids", () => {
      expect(deriveProductMetafields("Sneakers", "5", "Air Jordan 1 Retro High OG (GS)")).toEqual({
        ageGroup: "kids",
        targetGender: "unisex",
      });
    });

    it("Grade School in title → Unisex, Kids", () => {
      expect(deriveProductMetafields("Sneakers", "6", "Nike Dunk Low Grade School")).toEqual({
        ageGroup: "kids",
        targetGender: "unisex",
      });
    });

    it("TD in title → Unisex, Kids", () => {
      expect(deriveProductMetafields("Sneakers", "8C", "Nike Air Force 1 TD")).toEqual({
        ageGroup: "kids",
        targetGender: "unisex",
      });
    });

    it("PS in title → Unisex, Kids", () => {
      expect(deriveProductMetafields("Sneakers", "1", "Jordan 4 Retro PS")).toEqual({
        ageGroup: "kids",
        targetGender: "unisex",
      });
    });

    it("Kids in title → Unisex, Kids", () => {
      expect(deriveProductMetafields("Sneakers", "12", "Nike Air Max 90 Kids")).toEqual({
        ageGroup: "kids",
        targetGender: "unisex",
      });
    });
  });

  describe("other footwear", () => {
    it("Slides → Unisex, Adult", () => {
      expect(deriveProductMetafields("Slides", "10", "Yeezy Slide Glow Green")).toEqual({
        ageGroup: "adult",
        targetGender: "unisex",
      });
    });

    it("Boots → Unisex, Adult", () => {
      expect(deriveProductMetafields("Boots", "10", "Timberland 6-Inch Premium")).toEqual({
        ageGroup: "adult",
        targetGender: "unisex",
      });
    });
  });

  describe("non-footwear", () => {
    it("Hoodie → Unisex, Adult", () => {
      expect(deriveProductMetafields("Hoodies", "L", "Supreme Box Logo Hoodie")).toEqual({
        ageGroup: "adult",
        targetGender: "unisex",
      });
    });

    it("T-Shirt → Unisex, Adult", () => {
      expect(deriveProductMetafields("T-Shirts", "M", "Stussy 8 Ball Tee")).toEqual({
        ageGroup: "adult",
        targetGender: "unisex",
      });
    });

    it("Handbags → Female, Adult", () => {
      expect(deriveProductMetafields("Handbags", "O/S", "Louis Vuitton Keepall 55")).toEqual({
        ageGroup: "adult",
        targetGender: "female",
      });
    });

    it("Belts → Unisex, Adult", () => {
      expect(deriveProductMetafields("Belts", "85cm", "Gucci GG Marmont Belt")).toEqual({
        ageGroup: "adult",
        targetGender: "unisex",
      });
    });

    it("Caps → Unisex, Adult", () => {
      expect(deriveProductMetafields("Caps", "O/S", "Chrome Hearts Trucker Hat")).toEqual({
        ageGroup: "adult",
        targetGender: "unisex",
      });
    });

    it("Fitted Hats → Unisex, Adult", () => {
      expect(deriveProductMetafields("Fitted Hats", "7 3/8", "New Era Yankees 59FIFTY")).toEqual({
        ageGroup: "adult",
        targetGender: "unisex",
      });
    });
  });

  describe("edge cases", () => {
    it("null category → Unisex, Adult", () => {
      expect(deriveProductMetafields(null, "M", "Unknown Product")).toEqual({
        ageGroup: "adult",
        targetGender: "unisex",
      });
    });

    it("undefined category → Unisex, Adult", () => {
      expect(deriveProductMetafields(undefined, "10", "Mystery Item")).toEqual({
        ageGroup: "adult",
        targetGender: "unisex",
      });
    });

    it("size priority beats title — W size overrides non-womens title", () => {
      expect(deriveProductMetafields("Sneakers", "9W", "Air Jordan 1 Retro High")).toEqual({
        ageGroup: "adult",
        targetGender: "female",
      });
    });

    it("Y size overrides non-kids title", () => {
      expect(deriveProductMetafields("Sneakers", "5Y", "Air Jordan 1 Retro High")).toEqual({
        ageGroup: "kids",
        targetGender: "unisex",
      });
    });
  });
});
