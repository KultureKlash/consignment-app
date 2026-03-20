type SuggestResult = { brand?: string; mainCategory?: string; subCategory?: string };

const KEYWORD_RULES: Array<{
  keywords: string[];
  brand?: string;
  main?: string;
  sub?: string;
}> = [
  // Nike
  { keywords: ["dunk", "air force", "af1", "air max", "vapormax", "jordan", "aj1", "aj4", "blazer"],
    brand: "Nike", main: "Footwear", sub: "Sneakers" },
  { keywords: ["nike tech", "nike hoodie", "nike jogger"],
    brand: "Nike", main: "Apparel" },

  // Adidas
  { keywords: ["yeezy", "yeezy slide", "yeezy foam"],
    brand: "Adidas", main: "Footwear", sub: "Sneakers" },
  { keywords: ["samba", "gazelle", "campus", "superstar", "stan smith", "adidas forum"],
    brand: "Adidas", main: "Footwear", sub: "Sneakers" },

  // New Balance
  { keywords: ["new balance", "nb 550", "nb 2002r", "nb 990", "nb 530"],
    brand: "New Balance", main: "Footwear", sub: "Sneakers" },

  // ASICS
  { keywords: ["gel-kayano", "gel-1130", "gel-nyc", "asics"],
    brand: "ASICS", main: "Footwear", sub: "Sneakers" },

  // Luxury / Designer
  { keywords: ["louis vuitton", "lv"],
    brand: "Louis Vuitton" },
  { keywords: ["gucci"],
    brand: "Gucci" },
  { keywords: ["balenciaga", "triple s", "track runner"],
    brand: "Balenciaga", main: "Footwear", sub: "Sneakers" },

  // Other footwear
  { keywords: ["ugg", "ugg tasman", "ugg ultra mini"],
    brand: "UGG", main: "Footwear", sub: "Boots" },
  { keywords: ["birkenstock", "boston clog"],
    brand: "Birkenstock", main: "Footwear", sub: "Sandals" },
  { keywords: ["crocs", "clog"],
    brand: "Crocs", main: "Footwear", sub: "Slides" },
  { keywords: ["timberland", "timbs"],
    brand: "Timberland", main: "Footwear", sub: "Boots" },

  // Apparel brands
  { keywords: ["supreme"],
    brand: "Supreme" },
  { keywords: ["stussy", "stüssy"],
    brand: "Stussy" },
  { keywords: ["essentials", "fear of god"],
    brand: "Fear of God", main: "Apparel" },
  { keywords: ["trapstar"],
    brand: "Trapstar", main: "Apparel" },
  { keywords: ["corteiz"],
    brand: "Corteiz", main: "Apparel" },

  // Headwear keywords
  { keywords: ["fitted", "59fifty", "new era"],
    brand: "New Era", main: "Headwear", sub: "Fitted Hats" },
  { keywords: ["snapback"],
    main: "Headwear", sub: "Snapbacks" },
  { keywords: ["beanie"],
    main: "Headwear", sub: "Beanies" },
  { keywords: ["bucket hat"],
    main: "Headwear", sub: "Bucket Hats" },
  { keywords: ["cap"],
    main: "Headwear", sub: "Caps" },

  // Accessory keywords
  { keywords: ["bag", "tote", "backpack", "duffle"],
    main: "Accessories", sub: "Bags" },
  { keywords: ["wallet", "card holder"],
    main: "Accessories", sub: "Wallets" },
  { keywords: ["belt"],
    main: "Accessories", sub: "Belts" },
  { keywords: ["sunglasses"],
    main: "Accessories", sub: "Sunglasses" },
  { keywords: ["watch"],
    main: "Accessories", sub: "Watches" },

  // Generic footwear
  { keywords: ["sneaker", "shoe", "trainer", "runner"],
    main: "Footwear", sub: "Sneakers" },
  { keywords: ["boot"],
    main: "Footwear", sub: "Boots" },
  { keywords: ["slide"],
    main: "Footwear", sub: "Slides" },
  { keywords: ["sandal"],
    main: "Footwear", sub: "Sandals" },

  // Generic apparel
  { keywords: ["hoodie", "hoody"],
    main: "Apparel", sub: "Hoodies" },
  { keywords: ["sweatshirt", "crewneck", "crew neck"],
    main: "Apparel", sub: "Sweatshirts" },
  { keywords: ["sweater", "knit"],
    main: "Apparel", sub: "Sweaters" },
  { keywords: ["puffer", "puffer jacket"],
    main: "Apparel", sub: "Puffer Jackets" },
  { keywords: ["parka"],
    main: "Apparel", sub: "Parkas" },
  { keywords: ["vest", "gilet"],
    main: "Apparel", sub: "Vests" },
  { keywords: ["tee", "t-shirt", "tshirt"],
    main: "Apparel", sub: "T-Shirts" },
  { keywords: ["jeans", "denim"],
    main: "Apparel", sub: "Jeans" },
  { keywords: ["jogger short", "jogger shorts"],
    main: "Apparel", sub: "Jogger Shorts" },
  { keywords: ["outfit set", "set", "tracksuit"],
    main: "Apparel", sub: "Outfit Sets" },
  { keywords: ["varsity", "varsity jacket", "letterman"],
    main: "Apparel", sub: "Varsity Jacket" },
];

/**
 * Auto-suggest brand + category from a product title.
 * Returns partial results — only fills in what it can detect.
 * First match wins (rules ordered from most specific to most generic).
 */
export function autoSuggest(title: string): SuggestResult {
  const lower = title.toLowerCase();
  const result: SuggestResult = {};

  for (const rule of KEYWORD_RULES) {
    const matched = rule.keywords.some((kw) => lower.includes(kw));
    if (!matched) continue;

    if (rule.brand && !result.brand) result.brand = rule.brand;
    if (rule.main && !result.mainCategory) result.mainCategory = rule.main;
    if (rule.sub && !result.subCategory) result.subCategory = rule.sub;

    // Stop once we have all three
    if (result.brand && result.mainCategory && result.subCategory) break;
  }

  return result;
}
