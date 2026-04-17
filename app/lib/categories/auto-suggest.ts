type SuggestResult = { brand?: string; mainCategory?: string; subCategory?: string };

const KEYWORD_RULES: Array<{
  keywords: string[];
  brand?: string;
  main?: string;
  sub?: string;
}> = [
  // ── Nike / Jordan (top brand — 40% of inventory) ──
  { keywords: ["air jordan", "jordan 1", "jordan 3", "jordan 4", "jordan 5", "jordan 6", "jordan 9", "jordan 11", "jordan jumpman", "aj1", "aj4"],
    brand: "Air Jordan", main: "Footwear", sub: "Sneakers" },
  { keywords: ["jordan retro"],
    brand: "Air Jordan", main: "Footwear", sub: "Sneakers" },
  { keywords: ["dunk", "air force", "af1", "air max", "vapormax", "blazer", "cortez"],
    brand: "Nike", main: "Footwear", sub: "Sneakers" },
  { keywords: ["kobe"],
    brand: "Nike", main: "Footwear", sub: "Sneakers" },
  { keywords: ["nike sb"],
    brand: "Nike", main: "Footwear", sub: "Sneakers" },
  { keywords: ["nike tech", "nike hoodie", "nike jogger", "nike pant", "nike short"],
    brand: "Nike", main: "Apparel" },

  // ── Adidas / YEEZY ──
  { keywords: ["yeezy slide"],
    brand: "YEEZY", main: "Footwear", sub: "Slides" },
  { keywords: ["yeezy foam"],
    brand: "YEEZY", main: "Footwear", sub: "Slides" },
  { keywords: ["yeezy 350", "yeezy 500", "yeezy 700", "yeezy boost", "yeezy"],
    brand: "YEEZY", main: "Footwear", sub: "Sneakers" },
  { keywords: ["samba", "gazelle", "campus", "superstar", "stan smith", "adidas forum"],
    brand: "Adidas", main: "Footwear", sub: "Sneakers" },
  { keywords: ["adidas"],
    brand: "Adidas", main: "Footwear", sub: "Sneakers" },

  // ── New Balance ──
  { keywords: ["new balance", "nb 550", "nb 2002r", "nb 990", "nb 530"],
    brand: "New Balance", main: "Footwear", sub: "Sneakers" },

  // ── ASICS ──
  { keywords: ["gel-kayano", "gel-1130", "gel-nyc", "asics"],
    brand: "ASICS", main: "Footwear", sub: "Sneakers" },

  // ── Designer / Streetwear Apparel (high volume in your inventory) ──
  { keywords: ["chrome hearts"],
    brand: "Chrome Hearts" },
  { keywords: ["gallery dept"],
    brand: "Gallery Dept." },
  { keywords: ["hellstar"],
    brand: "Hellstar", main: "Apparel" },
  { keywords: ["amiri"],
    brand: "Amiri" },
  { keywords: ["sp5der"],
    brand: "Sp5der", main: "Apparel" },
  { keywords: ["rhude"],
    brand: "Rhude" },
  { keywords: ["denim tears"],
    brand: "Denim Tears", main: "Apparel" },
  { keywords: ["off-white", "off white"],
    brand: "OFF-WHITE" },
  { keywords: ["bape", "a bathing ape"],
    brand: "BAPE" },
  { keywords: ["who decides war"],
    brand: "Who Decides War", main: "Apparel" },
  { keywords: ["purple brand"],
    brand: "Purple Brand", main: "Apparel" },
  { keywords: ["casablanca"],
    brand: "CASABLANCA" },

  // ── Luxury ──
  { keywords: ["moncler"],
    brand: "Moncler" },
  { keywords: ["dior"],
    brand: "Dior" },
  { keywords: ["louis vuitton", "lv"],
    brand: "Louis Vuitton" },
  { keywords: ["gucci"],
    brand: "Gucci" },
  { keywords: ["goyard"],
    brand: "Goyard", main: "Accessories", sub: "Bags" },
  { keywords: ["balenciaga", "triple s", "track runner"],
    brand: "Balenciaga" },
  { keywords: ["prada"],
    brand: "Prada" },
  { keywords: ["lanvin"],
    brand: "LANVIN" },
  { keywords: ["canada goose"],
    brand: "Canada Goose", main: "Apparel", sub: "Puffer Jackets" },

  // ── Streetwear ──
  { keywords: ["supreme"],
    brand: "Supreme" },
  { keywords: ["stussy", "stüssy"],
    brand: "Stussy" },
  { keywords: ["essentials", "fear of god"],
    brand: "Fear of God Essentials", main: "Apparel" },
  { keywords: ["trapstar"],
    brand: "Trapstar", main: "Apparel" },
  { keywords: ["corteiz"],
    brand: "Corteiz", main: "Apparel" },

  // ── Other Footwear Brands ──
  { keywords: ["ugg tasman", "ugg ultra mini", "ugg"],
    brand: "UGG", main: "Footwear", sub: "Boots" },
  { keywords: ["birkenstock", "boston clog"],
    brand: "Birkenstock", main: "Footwear", sub: "Sandals" },
  { keywords: ["crocs"],
    brand: "Crocs", main: "Footwear", sub: "Slides" },
  { keywords: ["timberland", "timbs"],
    brand: "Timberland", main: "Footwear", sub: "Boots" },
  { keywords: ["salomon"],
    brand: "Salomon", main: "Footwear", sub: "Sneakers" },
  { keywords: ["vans old skool", "vans sk8", "vans"],
    brand: "Vans", main: "Footwear", sub: "Sneakers" },
  { keywords: ["converse", "chuck taylor"],
    brand: "Converse", main: "Footwear", sub: "Sneakers" },
  { keywords: ["puma"],
    brand: "Puma", main: "Footwear", sub: "Sneakers" },
  { keywords: ["reebok"],
    brand: "Reebok", main: "Footwear", sub: "Sneakers" },

  // ── Headwear ──
  { keywords: ["trucker hat", "trucker cap"],
    main: "Headwear", sub: "Trucker Hats" },
  { keywords: ["fitted", "59fifty", "new era"],
    brand: "New Era", main: "Headwear", sub: "Fitted Hats" },
  { keywords: ["snapback"],
    main: "Headwear", sub: "Snapbacks" },
  { keywords: ["beanie"],
    main: "Headwear", sub: "Beanies" },
  { keywords: ["bucket hat"],
    main: "Headwear", sub: "Bucket Hats" },
  { keywords: ["cap", "hat"],
    main: "Headwear", sub: "Caps" },

  // ── Accessory keywords ──
  { keywords: ["saddle bag", "saddle messenger"],
    main: "Accessories", sub: "Saddle Bags" },
  { keywords: ["messenger bag"],
    main: "Accessories", sub: "Messenger Bags" },
  { keywords: ["backpack"],
    main: "Accessories", sub: "Backpacks" },
  { keywords: ["pouch"],
    main: "Accessories", sub: "Pouches" },
  { keywords: ["handbag", "lady dior bag", "tote"],
    main: "Accessories", sub: "Handbags" },
  { keywords: ["bag", "duffle", "duffel"],
    main: "Accessories", sub: "Handbags" },
  { keywords: ["card holder", "card wallet", "bifold"],
    main: "Accessories", sub: "Card Holders" },
  { keywords: ["wallet", "organizer"],
    main: "Accessories", sub: "Wallets" },
  { keywords: ["belt"],
    main: "Accessories", sub: "Belts" },
  { keywords: ["sunglasses"],
    main: "Accessories", sub: "Sunglasses" },

  // ── Generic footwear ──
  { keywords: ["sneaker", "shoe", "trainer", "runner"],
    main: "Footwear", sub: "Sneakers" },
  { keywords: ["boot"],
    main: "Footwear", sub: "Boots" },
  { keywords: ["slide"],
    main: "Footwear", sub: "Slides" },
  { keywords: ["sandal"],
    main: "Footwear", sub: "Sandals" },

  // ── Generic apparel (ordered specific → generic) ──
  { keywords: ["jersey"],
    main: "Apparel", sub: "Jerseys" },
  { keywords: ["polo"],
    main: "Apparel", sub: "Polos" },
  { keywords: ["long sleeve", "longsleeve"],
    main: "Apparel", sub: "Long Sleeves" },
  { keywords: ["hoodie", "hoody"],
    main: "Apparel", sub: "Hoodies" },
  { keywords: ["sweatshirt", "crewneck", "crew neck"],
    main: "Apparel", sub: "Sweatshirts" },
  { keywords: ["sweater", "knit"],
    main: "Apparel", sub: "Sweaters" },
  { keywords: ["puffer"],
    main: "Apparel", sub: "Puffer Jackets" },
  { keywords: ["parka"],
    main: "Apparel", sub: "Parkas" },
  { keywords: ["varsity", "letterman"],
    main: "Apparel", sub: "Varsity Jackets" },
  { keywords: ["vest", "gilet"],
    main: "Apparel", sub: "Vests" },
  { keywords: ["jacket", "coat"],
    main: "Apparel", sub: "Jackets" },
  { keywords: ["sweatpant", "sweat pant", "flare pant", "track pant"],
    main: "Apparel", sub: "Sweatpants" },
  { keywords: ["jeans", "denim"],
    main: "Apparel", sub: "Jeans" },
  { keywords: ["cargo"],
    main: "Apparel", sub: "Pants" },
  { keywords: ["pant", "trouser"],
    main: "Apparel", sub: "Pants" },
  { keywords: ["short"],
    main: "Apparel", sub: "Shorts" },
  { keywords: ["tee", "t-shirt", "tshirt"],
    main: "Apparel", sub: "T-Shirts" },
  { keywords: ["tracksuit", "track suit", "outfit set"],
    main: "Apparel", sub: "Tracksuits" },
  { keywords: ["shirt"],
    main: "Apparel", sub: "T-Shirts" },
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
