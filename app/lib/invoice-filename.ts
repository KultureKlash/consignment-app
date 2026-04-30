/**
 * Build a meaningful filename for a consignor invoice PDF.
 * Format: <ConsignorName>-Payout-<YYYY-MM-DD>-Orders<#A>-<#B>[-+N more].pdf
 *
 * Example outputs:
 *   "Yaroslav-Bilodid-Payout-2026-04-30-Orders-KK1042-KK1045.pdf"
 *   "Marco-Del-Papa-Payout-2026-05-15.pdf"   (no order numbers known)
 *   "Yaroslav-Payout-2026-04-30-Orders-KK1042-KK1045-+3-more.pdf"  (4+ orders)
 */
export function buildInvoiceFileName(opts: {
  consignorName: string;
  payoutCreatedAt: Date | string;
  orderNumbers: string[];
}): string {
  const safeName = sanitize(opts.consignorName);
  const date = formatDate(opts.payoutCreatedAt);

  const uniqueOrders = [...new Set(opts.orderNumbers.filter(Boolean))];
  let ordersPart = "";
  if (uniqueOrders.length > 0) {
    const shown = uniqueOrders.slice(0, 2).map(stripHash);
    const more = uniqueOrders.length > 2 ? `-+${uniqueOrders.length - 2}-more` : "";
    ordersPart = `-Orders-${shown.join("-")}${more}`;
  }

  return `${safeName}-Payout-${date}${ordersPart}.pdf`;
}

function sanitize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function stripHash(orderNumber: string): string {
  return orderNumber.replace(/^#/, "");
}

function formatDate(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
