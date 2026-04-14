import { ChevronDown, ChevronRight, Clock, Download, FileText, CheckCircle2 } from "lucide-react";
import { fmt } from "~/lib/currency";
import { computeTax } from "~/lib/tax";
import type { PayoutRef } from "./payoutHelpers";
import { sectionCardClass, sectionHeaderClass, sectionTitleClass, gridCols, relativeDate } from "./payoutHelpers";

interface PendingSectionProps {
  payouts: PayoutRef[];
  expandedPayout: string | null;
  setExpandedPayout: (id: string | null) => void;
  handleMarkInvoiced: (payoutId: string) => void;
  handleMarkPaid: (payoutId: string) => void;
  handleCancel: (payoutId: string) => void;
  isSubmitting: boolean;
  scrollRef: (node: HTMLDivElement | null) => void;
  onDownload: (payouts: PayoutRef[]) => void;
}

export function PendingSection({
  payouts,
  expandedPayout,
  setExpandedPayout,
  handleMarkInvoiced,
  handleMarkPaid,
  handleCancel,
  isSubmitting,
  scrollRef,
  onDownload,
}: PendingSectionProps) {
  const pendingPayouts = payouts.filter((p) => p.status !== "paid");

  return (
    <div className={`${sectionCardClass} mb-6`}>
      <div className={sectionHeaderClass}>
        <Clock size={15} className="text-amber-600" />
        <h2 className={sectionTitleClass}>Pending Payouts</h2>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[11px] font-semibold text-[#6d7175]">
            {pendingPayouts.length} payout{pendingPayouts.length !== 1 ? "s" : ""}
          </span>
          {pendingPayouts.length > 0 && (
            <DownloadButton onClick={() => onDownload(pendingPayouts)} />
          )}
        </div>
      </div>

      {pendingPayouts.length === 0 ? (
        <div className="py-8 px-5 text-center text-gray-400 text-[13px]">
          No pending payouts.
        </div>
      ) : (
        <div>
          {pendingPayouts.map((payout) => {
            const isOpen = expandedPayout === payout.id;
            return (
              <div key={payout.id} className="border-b border-gray-200/40">
                <div
                  onClick={() => setExpandedPayout(isOpen ? null : payout.id)}
                  className="flex items-center px-5 py-3 cursor-pointer transition-colors duration-150 hover:bg-gray-50"
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
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                      payout.status === "invoiced"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-amber-50 text-amber-600"
                    }`}>
                      {payout.status === "pending"
                        ? (payout.consignor.taxStatus === "business" ? "Awaiting Invoice" : "Pending Payment")
                        : "Invoice Received"}
                    </span>
                    {payout.status === "pending" && payout.invoiceSent && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-blue-50 text-blue-600">
                        Invoice Sent
                      </span>
                    )}
                    <span className="text-sm font-bold text-[#1a1a1a] tabular-nums w-[90px] text-right">
                      ${fmt(payout.amount)}
                    </span>
                  </div>
                </div>

                {isOpen && (
                  <div ref={scrollRef} className="bg-gray-50 border-t border-gray-200/30">
                    <div
                      className="grid items-center px-5 pt-2 pb-1.5 pl-3 border-b border-gray-200/30 text-[10px] font-bold uppercase tracking-widest text-gray-400"
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
                        <div
                          key={pi.id}
                          className="grid items-center px-5 py-[7px] pl-3 border-t border-gray-200/15 text-[13px]"
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
                      );
                    })}
                    {/* Tax summary for business consignors */}
                    {(() => {
                      const tax = computeTax(payout.amount, payout.consignor);
                      if (!tax.isTaxable) return null;
                      return (
                        <div className="flex justify-end gap-6 px-5 py-2.5 border-t border-gray-200/30 bg-yellow-50 text-xs tabular-nums">
                          <span className="text-[#6d7175]">Subtotal <strong>${fmt(tax.subtotal)}</strong></span>
                          {tax.gst > 0 && <span className="text-[#6d7175]">GST (5%) <strong>${fmt(tax.gst)}</strong></span>}
                          {tax.qst > 0 && <span className="text-[#6d7175]">QST (9.975%) <strong>${fmt(tax.qst)}</strong></span>}
                          {tax.hst > 0 && <span className="text-[#6d7175]">{tax.taxLabel} <strong>${fmt(tax.hst)}</strong></span>}
                          <span className="font-bold text-[#1a1a1a]">Total Payable ${fmt(tax.total)}</span>
                        </div>
                      );
                    })()}
                    <div className="flex gap-2 px-5 py-3 pl-12 border-t border-gray-200/30">
                      {payout.status === "pending" && payout.consignor.taxStatus === "business" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMarkInvoiced(payout.id); }}
                          disabled={isSubmitting}
                          className={`admin-btn-primary bg-blue-600! hover:bg-blue-700! ${isSubmitting ? "cursor-default" : ""}`}
                        >
                          <FileText size={12} className="mr-1 align-middle inline" />
                          Mark Invoiced
                        </button>
                      )}
                      {(payout.status === "invoiced" || (payout.status === "pending" && payout.consignor.taxStatus !== "business")) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMarkPaid(payout.id); }}
                          disabled={isSubmitting}
                          className={`admin-btn-primary bg-emerald-600! hover:bg-emerald-700! ${isSubmitting ? "cursor-default" : ""}`}
                        >
                          <CheckCircle2 size={12} className="mr-1 align-middle inline" />
                          Mark Paid
                        </button>
                      )}
                      {payout.status === "pending" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCancel(payout.id); }}
                          disabled={isSubmitting}
                          className={`px-4 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-all duration-200 font-[inherit] bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 ${isSubmitting ? "cursor-default" : ""}`}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
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
