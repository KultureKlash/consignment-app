import { isFootwear } from "~/lib/categories";

type ProductMetafields = {
  ageGroup: "adult" | "kids";
  targetGender: "male" | "female" | "unisex";
};

const KIDS_TITLE_KEYWORDS = /\b(GS|Grade School|Kids|TD|PS|Toddler|Preschool)\b/i;
const WOMENS_TITLE_KEYWORDS = /\bWomen'?s\b/i;

/** Derive Shopify age_group + target_gender from category, size, and title. */
export function deriveProductMetafields(
  category: string | null | undefined,
  size: string,
  title: string,
): ProductMetafields {
  const sizeUpper = size.trim().toUpperCase();

  // Sneakers — StockX-style gender/age from size + title
  if (category === "Sneakers") {
    if (/\d+(\.\d+)?W$/.test(sizeUpper)) return { ageGroup: "adult", targetGender: "female" };
    if (/\d+(\.\d+)?Y$/.test(sizeUpper)) return { ageGroup: "kids", targetGender: "unisex" };
    if (KIDS_TITLE_KEYWORDS.test(title)) return { ageGroup: "kids", targetGender: "unisex" };
    if (WOMENS_TITLE_KEYWORDS.test(title)) return { ageGroup: "adult", targetGender: "female" };
    return { ageGroup: "adult", targetGender: "male" };
  }

  // Other footwear (Slides, Boots) — unisex adult
  if (isFootwear(category)) return { ageGroup: "adult", targetGender: "unisex" };

  // Handbags — female
  if (category === "Handbags") return { ageGroup: "adult", targetGender: "female" };

  // Everything else (Apparel, Accessories, Headwear, etc.) — unisex adult
  return { ageGroup: "adult", targetGender: "unisex" };
}
