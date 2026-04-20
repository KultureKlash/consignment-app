// Canadian tax rates for consignor payouts
// Business consignors invoice with tax based on their province.

export const GST_RATE = 0.05; // 5% federal GST
export const QST_RATE = 0.09975; // 9.975% Quebec QST

// Ontario consignors invoice with GST only (5%) since the supply is in Quebec.
// No HST — HST only applies for intra-provincial supplies.

export interface TaxBreakdown {
  subtotal: number;
  gst: number;
  qst: number;
  hst: number;
  total: number;
  isTaxable: boolean;
  taxLabel: string;
}

/**
 * Compute tax on a consignor payout.
 * - QC businesses: GST (5%) + QST (9.975%)
 * - All other provinces (ON, etc.): GST only (5%) — supply is in QC, no HST
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

  // All other provinces: GST only (5%)
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
