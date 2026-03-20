/**
 * Size comparison utility for sorting product variants in logical order.
 *
 * Handles:
 *   - Numeric sizes: 7, 7.5, 8, 9, 10, 10.5, 40, 42.5 (US + EU)
 *   - Clothing sizes: XXXS → XXXL
 *   - Special: "One Size" always sorts first
 *   - Fallback: alphabetical for unknown formats
 */

const CLOTHING_ORDER = [
  "XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL",
];

function sizeRank(size: string): number {
  const upper = size.toUpperCase().trim();

  // "One Size" always first
  if (upper === "ONE SIZE" || upper === "OS") return -1;

  // Clothing sizes
  const idx = CLOTHING_ORDER.indexOf(upper);
  if (idx !== -1) return idx;

  // Numeric (US 7, 7.5, EU 40, 42.5, etc.)
  const num = parseFloat(size);
  if (!isNaN(num)) return num;

  // Fallback: large number so unknowns sort last
  return 10000;
}

/**
 * Compare two size strings for sorting.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareSizes(a: string, b: string): number {
  return sizeRank(a) - sizeRank(b) || a.localeCompare(b);
}
