import crypto from "crypto";

// ── Subcategory abbreviations (controlled by us, finite set) ─────

const SUB_ABBREVIATIONS: Record<string, string> = {
  // Footwear
  "Sneakers": "SNK",
  "Athletic Shoes": "ATH",
  "Boots": "BTS",
  "Sandals": "SDL",
  "Slides": "SLD",
  "Loafers": "LFR",
  "Heels": "HLS",
  // Apparel
  "T-Shirts": "TEE",
  "Long Sleeves": "LSV",
  "Hoodies": "HOD",
  "Sweatshirts": "SWT",
  "Sweaters": "SWR",
  "Jackets": "JKT",
  "Puffer Jackets": "PFJ",
  "Parkas": "PRK",
  "Varsity Jackets": "VJK",
  "Vests": "VST",
  "Jeans": "JNS",
  "Pants": "PNT",
  "Sweatpants": "SWP",
  "Shorts": "SHT",
  "Jogger Shorts": "JGS",
  "Jerseys": "JRS",
  "Polos": "PLO",
  "Outfit Sets": "SET",
  // Accessories
  "Bags": "BAG",
  "Wallets": "WLT",
  "Belts": "BLT",
  "Sunglasses": "SUN",
  "Jewelry": "JWL",
  "Watches": "WCH",
  // Headwear
  "Caps": "CAP",
  "Beanies": "BNE",
  "Bucket Hats": "BKT",
  "Fitted Hats": "FIT",
  "Snapbacks": "SNP",
  "Trucker Hats": "TRK",
};

// ── Abbreviation helpers ─────────────────────────────────────────

/**
 * Abbreviate a brand name algorithmically:
 * - No brand → "XX"
 * - Multi-word → initials up to 4 chars (e.g. "Fear of God" → "FOG")
 * - Single word → first 3 chars (e.g. "Nike" → "NIK")
 */
export function abbreviateBrand(brand?: string): string {
  if (!brand || !brand.trim()) return "XX";
  const words = brand.trim().split(/\s+/);
  if (words.length > 1) {
    return words.map((w) => w[0]).join("").toUpperCase().slice(0, 4);
  }
  return brand.trim().slice(0, 3).toUpperCase();
}

/**
 * Abbreviate a subcategory: known subs get a fixed code, others get first 3 chars.
 */
export function abbreviateSubcategory(sub?: string): string {
  if (!sub) return "GEN";
  const known = SUB_ABBREVIATIONS[sub];
  if (known) return known;
  return sub.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();
}

// ── Random code generation ───────────────────────────────────────

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes)
    .map((b) => CHARS[b % CHARS.length])
    .join("");
}

// ── Barcode generation ───────────────────────────────────────────

/**
 * Generate an uppercase barcode candidate for non-footwear products.
 * Format: [BRAND]-[SUBCAT]-[SIZE]-[RANDOM8]
 * Example: FOG-HOD-L-A7X2KM9B
 *
 * Pure function — caller is responsible for DB uniqueness check.
 */
export function generateBarcode(
  brand: string | undefined,
  subcategory: string | undefined,
  size: string,
): string {
  const vendor = abbreviateBrand(brand);
  const type = abbreviateSubcategory(subcategory);
  const sizeClean = size.replace(/\s+/g, "").toUpperCase();
  return `${vendor}-${type}-${sizeClean}-${randomCode(8)}`;
}
