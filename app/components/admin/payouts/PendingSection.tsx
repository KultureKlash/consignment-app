import { useState } from "react";
import { ChevronDown, ChevronRight, Clock, Download, FileText, CheckCircle2 } from "lucide-react";
import { fmt } from "~/lib/currency";
import { computeTax } from "~/lib/tax";
import type { PayoutRef } from "./helpers";
import { sectionCard, sectionHeaderStyle, sectionTitleStyle, gridCols, relativeDate } from "./helpers";

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
    <div style={{ ...sectionCard, marginBottom: "24px" }}>
      <div style={sectionHeaderStyle}>
        <Clock size={15} color="#d97706" />
        <h2 style={sectionTitleStyle}>Pending Payouts</h2>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#6d7175" }}>
            {pendingPayouts.length} payout{pendingPayouts.length !== 1 ? "s" : ""}
          </span>
          {pendingPayouts.length > 0 && (
            <DownloadButton onClick={() => onDownload(pendingPayouts)} />
          )}
        </div>
      </div>

      {pendingPayouts.length === 0 ? (
        <div style={{ padding: "32px 20px", textAlign: "center", color: "#9ca3af", fontSize: "13px" }}>
          No pending payouts.
        </div>
      ) : (
        <div>
          {pendingPayouts.map((payout) => {
            const isOpen = expandedPayout === payout.id;
            return (
              <div key={payout.id} style={{ borderBottom: "1px solid rgba(227,227,227,0.4)" }}>
                <div
                  onClick={() => setExpandedPayout(isOpen ? null : payout.id)}
                  style={{ display: "flex", alignItems: "center", padding: "12px 20px", cursor: "pointer", transition: "background 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  {isOpen ? <ChevronDown size={16} color="#6d7175" /> : <ChevronRight size={16} color="#6d7175" />}
                  <span style={{ marginLeft: "8px", fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>
                    {payout.consignor.name}
                  </span>
                  <span style={{ marginLeft: "8px", fontSize: "12px", color: "#9ca3af" }}>
                    {payout.items.length} item{payout.items.length !== 1 ? "s" : ""}
                  </span>
                  <span style={{ marginLeft: "12px", fontSize: "12px", color: "#9ca3af" }}>
                    {relativeDate(payout.createdAt as unknown as string)}
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{
                      padding: "3px 10px",
                      borderRadius: "9999px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: payout.status === "invoiced" ? "#eff6ff" : "#fffbeb",
                      color: payout.status === "invoiced" ? "#2563eb" : "#d97706",
                      whiteSpace: "nowrap",
                    }}>
                      {payout.status === "pending"
                        ? (payout.consignor.taxStatus === "business" ? "Awaiting Invoice" : "Pending Payment")
                        : "Invoice Received"}
                    </span>
                    {payout.status === "pending" && payout.invoiceSent && (
                      <span style={{
                        padding: "3px 10px",
                        borderRadius: "9999px",
                        fontSize: "11px",
                        fontWeight: 600,
                        background: "#eff6ff",
                        color: "#2563eb",
                        whiteSpace: "nowrap",
                      }}>
                        Invoice Sent
                      </span>
                    )}
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a1a", fontVariantNumeric: "tabular-nums", width: "90px", textAlign: "right" }}>
                      ${fmt(payout.amount)}
                    </span>
                  </div>
                </div>

                {isOpen && (
                  <div ref={scrollRef} style={{ background: "#f9fafb", borderTop: "1px solid rgba(227,227,227,0.3)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: gridCols, alignItems: "center", padding: "8px 20px 6px 12px", borderBottom: "1px solid rgba(227,227,227,0.3)", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af" }}>
                      <span />
                      <span>Order</span>
                      <span>Product</span>
                      <span style={{ textAlign: "right" }}>Date Sold</span>
                      <span style={{ textAlign: "right" }}>Sale</span>
                      <span style={{ textAlign: "right" }}>Fee</span>
                      <span style={{ textAlign: "right", color: "#059669" }}>Payout</span>
                    </div>
                    {payout.items.map((pi) => {
                      const tx = pi.transaction;
                      const item = tx.orderItem;
                      const order = item?.order;
                      const product = item?.listing?.variant?.product;
                      const variant = item?.listing?.variant;
                      const soldDate = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "\u2014";
                      return (
                        <div key={pi.id} style={{ display: "grid", gridTemplateColumns: gridCols, alignItems: "center", padding: "7px 20px 7px 12px", borderTop: "1px solid rgba(227,227,227,0.15)", fontSize: "13px" }}>
                          <span />
                          <span style={{ fontSize: "12px", color: "#6d7175", fontVariantNumeric: "tabular-nums" }}>{order?.orderNumber ?? "\u2014"}</span>
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontWeight: 500, color: "#1a1a1a" }}>{product?.title ?? "Unknown"}</span>
                            <span style={{ color: "#9ca3af" }}> ({variant?.size ?? "?"})</span>
                          </div>
                          <span style={{ fontSize: "12px", color: "#6d7175", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{soldDate}</span>
                          <span style={{ fontSize: "12px", color: "#6d7175", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${fmt(tx.grossAmount)}</span>
                          <span style={{ fontSize: "12px", fontWeight: 500, color: "#1a1a1a", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${fmt(tx.feeAmount)}</span>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#059669", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${fmt(tx.consignorAmount)}</span>
                        </div>
                      );
                    })}
                    {/* Tax summary for business consignors */}
                    {(() => {
                      const tax = computeTax(payout.amount, payout.consignor);
                      if (!tax.isTaxable) return null;
                      return (
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "24px", padding: "10px 20px", borderTop: "1px solid rgba(227,227,227,0.3)", background: "#fefce8", fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>
                          <span style={{ color: "#6d7175" }}>Subtotal <strong>${fmt(tax.subtotal)}</strong></span>
                          {tax.gst > 0 && <span style={{ color: "#6d7175" }}>GST (5%) <strong>${fmt(tax.gst)}</strong></span>}
                          {tax.qst > 0 && <span style={{ color: "#6d7175" }}>QST (9.975%) <strong>${fmt(tax.qst)}</strong></span>}
                          {tax.hst > 0 && <span style={{ color: "#6d7175" }}>{tax.taxLabel} <strong>${fmt(tax.hst)}</strong></span>}
                          <span style={{ fontWeight: 700, color: "#1a1a1a" }}>Total Payable ${fmt(tax.total)}</span>
                        </div>
                      );
                    })()}
                    <div style={{ display: "flex", gap: "8px", padding: "12px 20px 12px 48px", borderTop: "1px solid rgba(227,227,227,0.3)" }}>
                      {payout.status === "pending" && payout.consignor.taxStatus === "business" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMarkInvoiced(payout.id); }}
                          disabled={isSubmitting}
                          style={{ padding: "6px 16px", fontSize: "12px", fontWeight: 600, color: "#fff", background: "#2563eb", border: "none", borderRadius: "8px", cursor: isSubmitting ? "default" : "pointer", fontFamily: "inherit" }}
                        >
                          <FileText size={12} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                          Mark Invoiced
                        </button>
                      )}
                      {(payout.status === "invoiced" || (payout.status === "pending" && payout.consignor.taxStatus !== "business")) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMarkPaid(payout.id); }}
                          disabled={isSubmitting}
                          style={{ padding: "6px 16px", fontSize: "12px", fontWeight: 600, color: "#fff", background: "#059669", border: "none", borderRadius: "8px", cursor: isSubmitting ? "default" : "pointer", fontFamily: "inherit" }}
                        >
                          <CheckCircle2 size={12} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                          Mark Paid
                        </button>
                      )}
                      {payout.status === "pending" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCancel(payout.id); }}
                          disabled={isSubmitting}
                          style={{ padding: "6px 16px", fontSize: "12px", fontWeight: 600, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", cursor: isSubmitting ? "default" : "pointer", fontFamily: "inherit" }}
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
