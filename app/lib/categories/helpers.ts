import { CATEGORIES } from "./constants";

/**
 * Build the category string stored in the DB.
 * Stores just the subcategory (e.g. "Sneakers", "Hoodies", "Caps") for clear logistics.
 * Falls back to main category if no sub provided.
 */
export function buildCategory(main: string, sub?: string): string {
  return sub || main;
}

/**
 * Parse category back into parts.
 * Supports both new format ("Sneakers") and legacy format ("Footwear > Sneakers").
 */
export function parseCategory(category: string): { main: string; sub?: string } {
  // Legacy format: "Footwear > Sneakers"
  if (category.includes(" > ")) {
    const parts = category.split(" > ");
    return { main: parts[0], sub: parts[1] };
  }
  // New format: just the subcategory — reverse-lookup the main category
  for (const [main, subs] of Object.entries(CATEGORIES)) {
    if (subs.includes(category)) return { main, sub: category };
  }
  // If it matches a main category name directly
  return { main: category };
}

const FOOTWEAR_TYPES = new Set([
  "Sneakers", "Athletic Shoes", "Boots", "Sandals", "Slides", "Loafers", "Heels",
]);

/**
 * Check if a category string represents footwear.
 */
export function isFootwear(category?: string | null): boolean {
  if (!category) return false;
  if (category.startsWith("Footwear")) return true;
  return FOOTWEAR_TYPES.has(category);
}
