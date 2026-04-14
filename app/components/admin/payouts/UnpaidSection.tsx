import { DollarSign, ChevronDown, ChevronRight, Download } from "lucide-react";
import { fmt } from "~/lib/currency";
import { computeTax } from "~/lib/tax";
import type { UnpaidEntry } from "./payoutHelpers";
import { sectionCardClass, sectionHeaderClass, sectionTitleClass, gridCols } from "./payoutHelpers";

interface UnpaidSectionProps {
  unpaid: UnpaidEntry[];
  expandedConsignor: string | null;
  toggleConsignor: (id: string) => void;
  selectedTxs: Record<string, Set<string>>;
  toggleTx: (consignorId: string, txId: string) => void;
  selectAll: (consignorId: string, txIds: string[]) => void;
  handleCreatePayout: (consignorId: string) => void;
  isSubmitting: boolean;
  scrollRef: (node: HTMLDivElement | null) => void;
  onDownload: () => void;
}

export function UnpaidSection({
  unpaid,
  expandedConsignor,
  toggleConsignor,
  selectedTxs,
  toggleTx,
  selectAll,
  handleCreatePayout,
  isSubmitting,
  scrollRef,
  onDownload,
}: UnpaidSectionProps) {
  return (
    <div className={`${sectionCardClass} mb-6`}>
      <div className={sectionHeaderClass}>
        <DollarSign size={15} className="text-[#6d7175]" />
        <h2 className={sectionTitleClass}>Unpaid Balances</h2>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[11px] font-semibold text-[#6d7175]">
            {unpaid.length} consignor{unpaid.length !== 1 ? "s" : ""}
          </span>
          {unpaid.length > 0 && (
            <DownloadButton onClick={onDownload} />
          )}
        </div>
      </div>

      {unpaid.length === 0 ? (
        <div className="py-8 px-5 text-center text-gray-400 text-[13px]">
          All consignors are paid up.
        </div>
      ) : (
        <div>
          {unpaid.map((entry) => {
            const isOpen = expandedConsignor === entry.consignor.id;
            const txIds = entry.transactions.map((tx) => tx.id);
            const selected = selectedTxs[entry.consignor.id] ?? new Set();
            const selectedAmount = entry.transactions
              .filter((tx) => selected.has(tx.id))
              .reduce((sum, tx) => sum + tx.consignorAmount, 0);

            return (
              <div key={entry.consignor.id} className="border-b border-gray-200/40">
                {/* Consignor row */}
                <div
                  onClick={() => toggleConsignor(entry.consignor.id)}
                  className="flex items-center px-5 py-3 cursor-pointer transition-colors duration-150 hover:bg-gray-50"
                >
                  {isOpen ? <ChevronDown size={16} className="text-[#6d7175]" /> : <ChevronRight size={16} className="text-[#6d7175]" />}
                  <span className="ml-2 text-[13px] font-semibold text-[#1a1a1a]">
                    {entry.consignor.name}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    {entry.transactions.length} item{entry.transactions.length !== 1 ? "s" : ""}
                  </span>
                  <div className="ml-auto flex flex-col items-end gap-0.5">
                    <div className="flex items-baseline gap-4">
                      <span className="text-xs font-semibold text-[#6d7175] tabular-nums">
                        Fee ${fmt(entry.transactions.reduce((sum, tx) => sum + tx.feeAmount, 0))}
                      </span>
                      <span className="text-sm font-bold text-emerald-600 tabular-nums">
                        ${fmt(entry.total)}
                      </span>
                    </div>
                    {(() => {
                      const tax = computeTax(entry.total, entry.consignor);
                      if (!tax.isTaxable) return null;
                      return (
                        <span className="text-[11px] text-gray-400 tabular-nums">
                          {tax.qst > 0 && `+GST $${fmt(tax.gst)} +QST $${fmt(tax.qst)}`}
                          {tax.hst > 0 && `+${tax.taxLabel} $${fmt(tax.hst)}`}
                          {tax.qst === 0 && tax.hst === 0 && `+GST $${fmt(tax.gst)}`}
                          {" "}= <strong className="text-[#6d7175]">${fmt(tax.total)}</strong> total
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Expanded: transaction list */}
                {isOpen && (
                  <div ref={scrollRef} className="bg-gray-50 border-t border-gray-200/30">
                    {/* Column headers with select-all checkbox */}
                    <div
                      className="grid items-center px-5 pt-2 pb-1.5 pl-3 border-b border-gray-200/40 text-[10px] font-bold uppercase tracking-widest text-gray-400"
                      style={{ gridTemplateColumns: gridCols }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.size === txIds.length && txIds.length > 0}
                        onChange={() => selectAll(entry.consignor.id, txIds)}
                        className="accent-gray-900"
                      />
                      <span>Order</span>
                      <span>Product</span>
                      <span className="text-right">Date Sold</span>
                      <span className="text-right">Sale</span>
                      <span className="text-right">Fee</span>
                      <span className="text-right text-emerald-600">Payout</span>
                    </div>

                    {/* Selection bar */}
                    {selected.size > 0 && (
                      <div className="flex items-center px-5 py-2 pl-3 gap-3 border-b border-gray-200/30">
                        <span className="text-xs text-gray-700 font-semibold">
                          {selected.size} selected · ${fmt(selectedAmount)}
                          {(() => {
                            const tax = computeTax(selectedAmount, entry.consignor);
                            return tax.isTaxable ? ` (${fmt(tax.total)} with tax)` : "";
                          })()}
                        </span>
                        <button
                          onClick={() => handleCreatePayout(entry.consignor.id)}
                          disabled={isSubmitting}
                          className={`admin-btn-primary ml-auto ${isSubmitting ? "opacity-70 cursor-default" : ""}`}
                        >
                          Create Payout
                        </button>
                      </div>
                    )}

                    {/* Transaction rows */}
                    {entry.transactions.map((tx) => {
                      const item = tx.orderItem;
                      const order = item?.order;
                      const product = item?.listing?.variant?.product;
                      const variant = item?.listing?.variant;
                      const soldDate = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "\u2014";

                      return (
                        <div
                          key={tx.id}
                          className="grid items-center px-5 py-[7px] pl-3 border-t border-gray-200/15 text-[13px]"
                          style={{ gridTemplateColumns: gridCols }}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(tx.id)}
                            onChange={() => toggleTx(entry.consignor.id, tx.id)}
                            className="accent-gray-900"
                          />
                          <span className="text-xs text-[#6d7175] tabular-nums">
                            {order?.orderNumber ?? "\u2014"}
                          </span>
                          <div className="min-w-0">
                            <span className="font-medium text-[#1a1a1a]">
                              {product?.title ?? "Unknown"}
                            </span>
                            <span className="text-gray-400"> ({variant?.size ?? "?"})</span>
                          </div>
                          <span className="text-xs text-[#6d7175] text-right tabular-nums">
                            {soldDate}
                          </span>
                          <span className="text-xs text-[#6d7175] text-right tabular-nums">
                            ${fmt(tx.grossAmount)}
                          </span>
                          <span className="text-xs font-medium text-[#1a1a1a] text-right tabular-nums">
                            ${fmt(tx.feeAmount)}
                          </span>
                          <span className="text-[13px] font-semibold text-emerald-600 text-right tabular-nums">
                            ${fmt(tx.consignorAmount)}
                          </span>
                        </div>
                      );
                    })}
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
