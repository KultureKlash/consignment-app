import { isFootwear } from "~/lib/categories";

// Shopify metaobject GIDs
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

const STYLE = {
  ATHLETIC: "gid://shopify/Metaobject/210366365814",
  FASHION: "gid://shopify/Metaobject/210366398582",
  HIGH_TOP: "gid://shopify/Metaobject/210366431350",
  LOW_TOP: "gid://shopify/Metaobject/210366464118",
  SLIP_ON: "gid://shopify/Metaobject/210366496886",
  OTHER: "gid://shopify/Metaobject/210366529654",
};

type ProductMetafields = {
  ageGroup: string;
  targetGender: string;
  sneakerStyles: string[];
};

const KIDS_TITLE_KEYWORDS = /\b(GS|Grade School|Kids|TD|PS|Toddler|Preschool)\b/i;
const WOMENS_TITLE_KEYWORDS = /\bWomen'?s\b/i;

// ── Sneaker style derivation ──

// Pure fashion designer brands
const FASHION_BRANDS = /\b(Dior|Balenciaga|Chanel|Gucci|Louis Vuitton|LV|Prada|Valentino|Rick Owens|Off-White|Maison Margiela|Givenchy|Versace|Burberry|Amiri|Rhude|Palm Angels)\b/i;

// Pure athletic brands/lines
const ATHLETIC_BRANDS = /\b(Asics|Kobe|Puma|Reebok|Under Armour|Hoka|On Running|Saucony|Brooks|Mizuno)\b/i;

// Athletic Nike models (running, training, basketball performance)
const ATHLETIC_NIKE = /\b(React|Vaporfly|Pegasus|ZoomX|Kobe \d|LeBron \d|KD \d|Kyrie \d|Alphafly|Invincible|Vomero|Free Run)\b/i;

// Fashion Nike/Jordan/Adidas models (hype, lifestyle, resale)
const FASHION_MODELS = /\b(Jordan [1-9]|Jordan 1[0-4]|Dunk|Air Force 1|Air Max|Yeezy|Travis Scott|Off-White|Fragment|Union|Sacai|Fear of God)\b/i;

// Height keywords
const HIGH_TOP_KEYWORDS = /\bHigh\b|\bMid\b|Jordan [1-9](?!.*Low)|Jordan 1[0-4](?!.*Low)|Blazer Mid/i;
const LOW_TOP_KEYWORDS = /\bLow\b|Dunk(?!.*High)|Air Force 1(?!.*Mid|.*High)|Air Max|Yeezy 350|Yeezy 500|Yeezy 700|New Balance \d/i;
const SLIP_ON_KEYWORDS = /\bSlide\b|Foam R(?:un)?n(?:er)?|Clog|Mule/i;

function deriveSneakerStyles(title: string, brand: string | null | undefined, category: string | null | undefined): string[] {
  if (!isFootwear(category)) return [];

  const styles: string[] = [];

  // Slides = slip-on
  if (category === "Slides") { styles.push(STYLE.SLIP_ON); return styles; }
  // Boots = high-top
  if (category === "Boots") { styles.push(STYLE.HIGH_TOP); return styles; }

  // Slip-on detection from title
  if (SLIP_ON_KEYWORDS.test(title)) {
    styles.push(STYLE.SLIP_ON);
    return styles;
  }

  // Height: high-top vs low-top
  if (HIGH_TOP_KEYWORDS.test(title)) styles.push(STYLE.HIGH_TOP);
  else if (LOW_TOP_KEYWORDS.test(title)) styles.push(STYLE.LOW_TOP);
  else styles.push(STYLE.LOW_TOP); // default for sneakers

  // Athletic vs Fashion
  const brandAndTitle = `${brand ?? ""} ${title}`;

  if (FASHION_BRANDS.test(brandAndTitle)) {
    styles.push(STYLE.FASHION);
  } else if (ATHLETIC_BRANDS.test(brandAndTitle) || ATHLETIC_NIKE.test(title)) {
    styles.push(STYLE.ATHLETIC);
  } else if (FASHION_MODELS.test(title)) {
    styles.push(STYLE.FASHION);
  } else {
    // Default: Nike/Adidas/NB general → fashion (resale market = fashion)
    styles.push(STYLE.FASHION);
  }

  return styles;
}

/** Derive Shopify metaobject GIDs for age_group, target_gender, and sneaker_style. */
export function deriveProductMetafields(
  category: string | null | undefined,
  size: string,
  title: string,
  brand?: string | null,
): ProductMetafields {
  const sizeUpper = size.trim().toUpperCase();
  const sneakerStyles = deriveSneakerStyles(title, brand, category);

  if (category === "Sneakers") {
    if (/\d+(\.\d+)?W$/.test(sizeUpper)) return { ageGroup: AGE_GROUP.ADULTS, targetGender: GENDER.FEMALE, sneakerStyles };
    if (/\d+(\.\d+)?Y$/.test(sizeUpper)) return { ageGroup: AGE_GROUP.KIDS, targetGender: GENDER.UNISEX, sneakerStyles };
    if (KIDS_TITLE_KEYWORDS.test(title)) return { ageGroup: AGE_GROUP.KIDS, targetGender: GENDER.UNISEX, sneakerStyles };
    if (WOMENS_TITLE_KEYWORDS.test(title)) return { ageGroup: AGE_GROUP.ADULTS, targetGender: GENDER.FEMALE, sneakerStyles };
    return { ageGroup: AGE_GROUP.ADULTS, targetGender: GENDER.MALE, sneakerStyles };
  }

  if (isFootwear(category)) return { ageGroup: AGE_GROUP.ADULTS, targetGender: GENDER.UNISEX, sneakerStyles };
  if (category === "Handbags") return { ageGroup: AGE_GROUP.ADULTS, targetGender: GENDER.FEMALE, sneakerStyles: [] };

  return { ageGroup: AGE_GROUP.ADULTS, targetGender: GENDER.UNISEX, sneakerStyles: [] };
}
