import { ChevronDown, ChevronRight, CheckCircle2, Download } from "lucide-react";
import { fmt } from "~/lib/currency";
import { computeTax } from "~/lib/tax";
import type { PayoutRef } from "./payoutHelpers";
import { sectionCardClass, sectionHeaderClass, sectionTitleClass, gridCols, relativeDate } from "./payoutHelpers";

interface HistorySectionProps {
  payouts: PayoutRef[];
  expandedPayout: string | null;
  setExpandedPayout: (id: string | null) => void;
  scrollRef: (node: HTMLDivElement | null) => void;
  onDownload: (payouts: PayoutRef[]) => void;
}

export function HistorySection({
  payouts,
  expandedPayout,
  setExpandedPayout,
  scrollRef,
  onDownload,
}: HistorySectionProps) {
  const paidPayouts = payouts.filter((p) => p.status === "paid");

  return (
    <div className={sectionCardClass}>
      <div className={sectionHeaderClass}>
        <CheckCircle2 size={15} className="text-emerald-600" />
        <h2 className={sectionTitleClass}>Payout History</h2>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[11px] font-semibold text-[#6d7175]">
            {paidPayouts.length} payout{paidPayouts.length !== 1 ? "s" : ""}
          </span>
          {paidPayouts.length > 0 && (
            <DownloadButton onClick={() => onDownload(paidPayouts)} />
          )}
        </div>
      </div>

      {paidPayouts.length === 0 ? (
        <div className="py-8 px-5 text-center text-gray-400 text-[13px]">
          No completed payouts yet.
        </div>
      ) : (
        <div>
          {paidPayouts.map((payout) => {
            const isOpen = expandedPayout === payout.id;
            return (
              <div key={payout.id} className="border-b border-gray-200/40">
                <div
                  onClick={() => setExpandedPayout(isOpen ? null : payout.id)}
                  className="flex flex-wrap items-center px-4 md:px-5 py-3 cursor-pointer transition-colors duration-150 hover:bg-gray-50"
                >
                  {isOpen ? <ChevronDown size={16} className="text-[#6d7175]" /> : <ChevronRight size={16} className="text-[#6d7175]" />}
                  <span className="ml-2 text-[13px] font-semibold text-[#1a1a1a]">
                    {payout.consignor.name}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    {payout.items.length} item{payout.items.length !== 1 ? "s" : ""}
                  </span>
                  <span className="ml-3 text-xs text-gray-400">
                    {relativeDate(payout.createdAt as unknown as string)}
                  </span>
                  <div className="ml-auto flex items-center gap-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-600 w-12 text-center">
                      Paid
                    </span>
                    <span className="text-sm font-bold text-[#1a1a1a] tabular-nums w-[90px] text-right">
                      ${fmt(payout.amount)}
                    </span>
                  </div>
                </div>

                {isOpen && (
                  <div ref={scrollRef} className="bg-gray-50 border-t border-gray-200/30">
                    {/* Desktop: column headers */}
                    <div
                      className="hidden md:grid items-center px-5 pt-2 pb-1.5 pl-3 border-b border-gray-200/30 text-[10px] font-bold uppercase tracking-widest text-gray-400"
                      style={{ gridTemplateColumns: gridCols }}
                    >
                      <span />
                      <span>Order</span>
                      <span>Product</span>
                      <span className="text-right">Date Sold</span>
                      <span className="text-right">Sale</span>
                      <span className="text-right">Fee</span>
                      <span className="text-right text-emerald-600">Payout</span>
                    </div>
                    {payout.items.map((pi) => {
                      const tx = pi.transaction;
                      const item = tx.orderItem;
                      const order = item?.order;
                      const product = item?.listing?.variant?.product;
                      const variant = item?.listing?.variant;
                      const soldDate = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "\u2014";
                      return (
                        <div key={pi.id}>
                          {/* Desktop row */}
                          <div
                            className="hidden md:grid items-center px-5 py-[7px] pl-3 border-t border-gray-200/15 text-[13px]"
                            style={{ gridTemplateColumns: gridCols }}
                          >
                            <span />
                            <span className="text-xs text-[#6d7175] tabular-nums">{order?.orderNumber ?? "\u2014"}</span>
                            <div className="min-w-0">
                              <span className="font-medium text-[#1a1a1a]">{product?.title ?? "Unknown"}</span>
                              <span className="text-gray-400"> ({variant?.size ?? "?"})</span>
                            </div>
                            <span className="text-xs text-[#6d7175] text-right tabular-nums">{soldDate}</span>
                            <span className="text-xs text-[#6d7175] text-right tabular-nums">${fmt(tx.grossAmount)}</span>
                            <span className="text-xs font-medium text-[#1a1a1a] text-right tabular-nums">${fmt(tx.feeAmount)}</span>
                            <span className="text-[13px] font-semibold text-emerald-600 text-right tabular-nums">${fmt(tx.consignorAmount)}</span>
                          </div>
                          {/* Mobile card */}
                          <div className="md:hidden px-4 py-3 border-t border-gray-200/15 text-[13px]">
                            <div className="font-medium text-[#1a1a1a] truncate">
                              {product?.title ?? "Unknown"} <span className="text-gray-400">({variant?.size ?? "?"})</span>
                            </div>
                            <div className="flex items-center justify-between mt-1 text-xs text-[#6d7175]">
                              <span>{order?.orderNumber ?? "\u2014"} · {soldDate}</span>
                              <span className="font-semibold text-emerald-600 text-[13px]">${fmt(tx.consignorAmount)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Tax summary for business consignors */}
                    {(() => {
                      const tax = computeTax(payout.amount, payout.consignor);
                      if (!tax.isTaxable) return null;
                      return (
                        <div className="flex flex-wrap justify-end gap-3 md:gap-6 px-4 md:px-5 py-2.5 border-t border-gray-200/30 bg-yellow-50 text-xs tabular-nums">
                          <span className="text-[#6d7175]">Subtotal <strong>${fmt(tax.subtotal)}</strong></span>
                          {tax.gst > 0 && <span className="text-[#6d7175]">GST (5%) <strong>${fmt(tax.gst)}</strong></span>}
                          {tax.qst > 0 && <span className="text-[#6d7175]">QST (9.975%) <strong>${fmt(tax.qst)}</strong></span>}
                          {tax.hst > 0 && <span className="text-[#6d7175]">{tax.taxLabel} <strong>${fmt(tax.hst)}</strong></span>}
                          <span className="font-bold text-[#1a1a1a]">Total Paid ${fmt(tax.total)}</span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DownloadButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Download CSV"
      className="bg-transparent border-none cursor-pointer p-0.5 text-gray-400 transition-colors duration-150 hover:text-[#1a1a1a]"
    >
      <Download size={14} />
    </button>
  );
}
