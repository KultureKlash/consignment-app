import { isFootwear } from "~/lib/categories";

// Shopify metaobject GIDs for age group + target gender
const AGE_GROUP = {
  ADULTS: "gid://shopify/Metaobject/210365284470",
  KIDS: "gid://shopify/Metaobject/210365513846",
  TEENS: "gid://shopify/Metaobject/210365579382",
};

const GENDER = {
  MALE: "gid://shopify/Metaobject/210365743222",
  FEMALE: "gid://shopify/Metaobject/210365710454",
  UNISEX: "gid://shopify/Metaobject/210365317238",
};

type ProductMetafields = {
  ageGroup: string;
  targetGender: string;
};

const KIDS_TITLE_KEYWORDS = /\b(GS|Grade School|Kids|TD|PS|Toddler|Preschool)\b/i;
const WOMENS_TITLE_KEYWORDS = /\bWomen'?s\b/i;

/** Derive Shopify age_group + target_gender metaobject GIDs from category, size, and title. */
export function deriveProductMetafields(
  category: string | null | undefined,
  size: string,
  title: string,
): ProductMetafields {
  const sizeUpper = size.trim().toUpperCase();

  if (category === "Sneakers") {
    if (/\d+(\.\d+)?W$/.test(sizeUpper)) return { ageGroup: AGE_GROUP.ADULTS, targetGender: GENDER.FEMALE };
    if (/\d+(\.\d+)?Y$/.test(sizeUpper)) return { ageGroup: AGE_GROUP.KIDS, targetGender: GENDER.UNISEX };
    if (KIDS_TITLE_KEYWORDS.test(title)) return { ageGroup: AGE_GROUP.KIDS, targetGender: GENDER.UNISEX };
    if (WOMENS_TITLE_KEYWORDS.test(title)) return { ageGroup: AGE_GROUP.ADULTS, targetGender: GENDER.FEMALE };
    return { ageGroup: AGE_GROUP.ADULTS, targetGender: GENDER.MALE };
  }

  if (isFootwear(category)) return { ageGroup: AGE_GROUP.ADULTS, targetGender: GENDER.UNISEX };
  if (category === "Handbags") return { ageGroup: AGE_GROUP.ADULTS, targetGender: GENDER.FEMALE };

  return { ageGroup: AGE_GROUP.ADULTS, targetGender: GENDER.UNISEX };
}
