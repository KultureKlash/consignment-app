import { useState } from "react";
import { ChevronDown, ChevronRight, DollarSign, Download } from "lucide-react";
import { fmt } from "~/lib/currency";
import { computeTax } from "~/lib/tax";
import type { UnpaidEntry } from "./helpers";
import { sectionCard, sectionHeaderStyle, sectionTitleStyle, gridCols } from "./helpers";

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
    <div style={{ ...sectionCard, marginBottom: "24px" }}>
      <div style={sectionHeaderStyle}>
        <DollarSign size={15} color="#6d7175" />
        <h2 style={sectionTitleStyle}>Unpaid Balances</h2>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#6d7175" }}>
            {unpaid.length} consignor{unpaid.length !== 1 ? "s" : ""}
          </span>
          {unpaid.length > 0 && (
            <DownloadButton onClick={onDownload} />
          )}
        </div>
      </div>

      {unpaid.length === 0 ? (
        <div style={{ padding: "32px 20px", textAlign: "center", color: "#9ca3af", fontSize: "13px" }}>
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
              <div key={entry.consignor.id} style={{ borderBottom: "1px solid rgba(227,227,227,0.4)" }}>
                {/* Consignor row */}
                <div
                  onClick={() => toggleConsignor(entry.consignor.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "12px 20px",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  {isOpen ? <ChevronDown size={16} color="#6d7175" /> : <ChevronRight size={16} color="#6d7175" />}
                  <span style={{ marginLeft: "8px", fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>
                    {entry.consignor.name}
                  </span>
                  <span style={{ marginLeft: "8px", fontSize: "12px", color: "#9ca3af" }}>
                    {entry.transactions.length} item{entry.transactions.length !== 1 ? "s" : ""}
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "16px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#6d7175", fontVariantNumeric: "tabular-nums" }}>
                        Fee ${fmt(entry.transactions.reduce((sum, tx) => sum + tx.feeAmount, 0))}
                      </span>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "#059669", fontVariantNumeric: "tabular-nums" }}>
                        ${fmt(entry.total)}
                      </span>
                    </div>
                    {(() => {
                      const tax = computeTax(entry.total, entry.consignor);
                      if (!tax.isTaxable) return null;
                      return (
                        <span style={{ fontSize: "11px", color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>
                          {tax.qst > 0 && `+GST $${fmt(tax.gst)} +QST $${fmt(tax.qst)}`}
                          {tax.hst > 0 && `+${tax.taxLabel} $${fmt(tax.hst)}`}
                          {tax.qst === 0 && tax.hst === 0 && `+GST $${fmt(tax.gst)}`}
                          {" "}= <strong style={{ color: "#6d7175" }}>${fmt(tax.total)}</strong> total
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Expanded: transaction list */}
                {isOpen && (
                  <div ref={scrollRef} style={{ background: "#f9fafb", borderTop: "1px solid rgba(227,227,227,0.3)" }}>
                    {/* Column headers with select-all checkbox */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: gridCols,
                        alignItems: "center",
                        padding: "8px 20px 6px 12px",
                        borderBottom: "1px solid rgba(227,227,227,0.4)",
                        fontSize: "10px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "#9ca3af",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.size === txIds.length && txIds.length > 0}
                        onChange={() => selectAll(entry.consignor.id, txIds)}
                        style={{ accentColor: "#111827" }}
                      />
                      <span>Order</span>
                      <span>Product</span>
                      <span style={{ textAlign: "right" }}>Date Sold</span>
                      <span style={{ textAlign: "right" }}>Sale</span>
                      <span style={{ textAlign: "right" }}>Fee</span>
                      <span style={{ textAlign: "right", color: "#059669" }}>Payout</span>
                    </div>

                    {/* Selection bar */}
                    {selected.size > 0 && (
                      <div style={{ display: "flex", alignItems: "center", padding: "8px 20px 8px 12px", gap: "12px", borderBottom: "1px solid rgba(227,227,227,0.3)" }}>
                        <span style={{ fontSize: "12px", color: "#374151", fontWeight: 600 }}>
                          {selected.size} selected · ${fmt(selectedAmount)}
                          {(() => {
                            const tax = computeTax(selectedAmount, entry.consignor);
                            return tax.isTaxable ? ` (${fmt(tax.total)} with tax)` : "";
                          })()}
                        </span>
                        <button
                          onClick={() => handleCreatePayout(entry.consignor.id)}
                          disabled={isSubmitting}
                          style={{
                            marginLeft: "auto",
                            padding: "6px 16px",
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "#fff",
                            background: "#111827",
                            border: "none",
                            borderRadius: "8px",
                            cursor: isSubmitting ? "default" : "pointer",
                            opacity: isSubmitting ? 0.7 : 1,
                            fontFamily: "inherit",
                          }}
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
                          style={{
                            display: "grid",
                            gridTemplateColumns: gridCols,
                            alignItems: "center",
                            padding: "7px 20px 7px 12px",
                            borderTop: "1px solid rgba(227,227,227,0.15)",
                            fontSize: "13px",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(tx.id)}
                            onChange={() => toggleTx(entry.consignor.id, tx.id)}
                            style={{ accentColor: "#111827" }}
                          />
                          <span style={{ fontSize: "12px", color: "#6d7175", fontVariantNumeric: "tabular-nums" }}>
                            {order?.orderNumber ?? "\u2014"}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontWeight: 500, color: "#1a1a1a" }}>
                              {product?.title ?? "Unknown"}
                            </span>
                            <span style={{ color: "#9ca3af" }}> ({variant?.size ?? "?"})</span>
                          </div>
                          <span style={{ fontSize: "12px", color: "#6d7175", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {soldDate}
                          </span>
                          <span style={{ fontSize: "12px", color: "#6d7175", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            ${fmt(tx.grossAmount)}
                          </span>
                          <span style={{ fontSize: "12px", fontWeight: 500, color: "#1a1a1a", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            ${fmt(tx.feeAmount)}
                          </span>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#059669", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
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
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title="Download CSV"
      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: hovered ? "#1a1a1a" : "#9ca3af", transition: "color 0.15s" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Download size={14} />
    </button>
  );
}
