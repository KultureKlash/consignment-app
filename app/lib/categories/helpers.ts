/**
 * Build the category string stored in the DB: "Main > Sub" or just "Main".
 */
export function buildCategory(main: string, sub?: string): string {
  if (sub) return `${main} > ${sub}`;
  return main;
}

/**
 * Parse "Main > Sub" back into parts.
 */
export function parseCategory(category: string): { main: string; sub?: string } {
  const parts = category.split(" > ");
  return { main: parts[0], sub: parts[1] };
}

/**
 * Check if a category string represents footwear.
 */
export function isFootwear(category?: string | null): boolean {
  if (!category) return false;
  return category.startsWith("Footwear");
}
