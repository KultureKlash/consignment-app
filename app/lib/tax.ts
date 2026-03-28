// Canadian tax rates for consignor payouts
// Business consignors invoice with tax based on their province.

export const GST_RATE = 0.05; // 5% federal GST
export const QST_RATE = 0.09975; // 9.975% Quebec QST

// HST rates by province (combined federal + provincial)
// Add more provinces here when needed
const HST_RATES: Record<string, number> = {
  ON: 0.13, // Ontario 13%
  // NS: 0.15, // Nova Scotia 15%
  // NB: 0.15, // New Brunswick 15%
  // NL: 0.15, // Newfoundland & Labrador 15%
  // PE: 0.15, // Prince Edward Island 15%
};

export interface TaxBreakdown {
  subtotal: number;
  gst: number;
  qst: number;
  hst: number;
  total: number;
  isTaxable: boolean;
  taxLabel: string; // e.g. "GST + QST", "HST (13%)", "GST"
}

/**
 * Compute tax on a consignor payout.
 * - QC businesses: GST (5%) + QST (9.975%)
 * - HST provinces (ON, NS, NB, NL, PE): HST (13-15%)
 * - Other provinces (AB, BC, MB, SK): GST only (5%)
 * - Individuals: no tax
 */
export function computeTax(
  subtotal: number,
  consignor: { taxStatus: string; province?: string | null },
): TaxBreakdown {
  const isTaxable = consignor.taxStatus === "business";
  const zero: TaxBreakdown = { subtotal, gst: 0, qst: 0, hst: 0, total: subtotal, isTaxable, taxLabel: "" };

  if (!isTaxable || subtotal <= 0) return zero;

  const prov = consignor.province || "";

  // Quebec: GST + QST
  if (prov === "QC") {
    const gst = round2(subtotal * GST_RATE);
    const qst = round2(subtotal * QST_RATE);
    return {
      subtotal, gst, qst, hst: 0,
      total: round2(subtotal + gst + qst),
      isTaxable, taxLabel: "GST + QST",
    };
  }

  // HST provinces (ON, NS, NB, NL, PE)
  const hstRate = HST_RATES[prov];
  if (hstRate) {
    const hst = round2(subtotal * hstRate);
    return {
      subtotal, gst: 0, qst: 0, hst,
      total: round2(subtotal + hst),
      isTaxable, taxLabel: `HST (${(hstRate * 100).toFixed(0)}%)`,
    };
  }

  // All other provinces (AB, BC, MB, SK): GST only
  const gst = round2(subtotal * GST_RATE);
  return {
    subtotal, gst, qst: 0, hst: 0,
    total: round2(subtotal + gst),
    isTaxable, taxLabel: "GST",
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
