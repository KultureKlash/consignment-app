/**
 * Format a number as USD currency: 1,000.00
 * Use this everywhere prices/money are displayed.
 */
export function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
