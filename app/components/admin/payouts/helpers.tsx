import type React from "react";
import { useState } from "react";
import { fmt } from "~/lib/currency";
import { generateCsv, downloadCsv } from "~/lib/csv";

// ── Shared types ──

export interface ConsignorRef {
  id: string;
  name: string;
  email: string;
  taxStatus: string;
  province?: string | null;
}

export interface TransactionRef {
  id: string;
  grossAmount: number;
  feeAmount: number;
  consignorAmount: number;
  createdAt: string;
  orderItem?: {
    order?: { orderNumber?: string | null };
    listing?: {
      variant?: {
        size?: string | null;
        product?: { title?: string | null };
      };
    };
  } | null;
}

export interface UnpaidEntry {
  consignor: ConsignorRef;
  transactions: TransactionRef[];
  total: number;
}

export interface PayoutItemRef {
  id: string;
  transaction: TransactionRef;
}

export interface PayoutRef {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  invoiceSent?: boolean | null;
  consignorId: string;
  consignor: ConsignorRef;
  items: PayoutItemRef[];
}

// ── Shared styles ──

export const sectionCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(227,227,227,0.6)",
  borderRadius: "12px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  overflow: "hidden",
};

export const sectionHeaderStyle: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid rgba(227,227,227,0.5)",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

export const sectionTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#1a1a1a",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  margin: 0,
};

export const gridCols = "36px 100px 1fr 100px 90px 90px 90px";

// ── Shared utilities ──

export function relativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── StatCard ──

export function StatCard({ label, value, icon: Icon, accentColor }: { label: string; value: string; icon: React.ElementType; accentColor: string; bgTint: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative", background: "#fff",
        border: `1px solid ${hovered ? "rgba(200,200,200,0.8)" : "rgba(227,227,227,0.6)"}`,
        borderRadius: "10px", padding: "18px 20px", transition: "all 0.2s ease",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        boxShadow: hovered ? "0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)" : "0 1px 2px rgba(0,0,0,0.03)",
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <span style={{ fontSize: "12px", fontWeight: 500, color: "#6d7175", letterSpacing: "0.01em" }}>{label}</span>
        <Icon size={20} color={accentColor} strokeWidth={1.8} />
      </div>
      <div style={{ fontSize: "24px", fontWeight: 600, color: "#1a1a1a", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.025em", lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

// ── CSV download helpers ──

export function downloadUnpaidCsv(filteredUnpaid: UnpaidEntry[], today: string) {
  const headers = ["Consignor", "Email", "Order #", "Product", "Size", "Date Sold", "Sale", "Fee", "Payout", "Status"];
  const rows = filteredUnpaid.flatMap((entry) =>
    entry.transactions.map((tx: any) => [
      entry.consignor.name, entry.consignor.email, tx.orderItem?.order?.orderNumber ?? "", tx.orderItem?.listing?.variant?.product?.title ?? "", tx.orderItem?.listing?.variant?.size ?? "",
      tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : "", tx.grossAmount.toFixed(2), tx.feeAmount.toFixed(2), tx.consignorAmount.toFixed(2), "Unpaid",
    ]),
  );
  downloadCsv(`payouts-unpaid-${today}.csv`, generateCsv(headers, rows));
}

export function downloadPayoutsCsv(payoutList: PayoutRef[], label: string, today: string) {
  const headers = ["Consignor", "Email", "Order #", "Product", "Size", "Date Sold", "Sale", "Fee", "Payout", "Status", "Payout Date"];
  const rows = payoutList.flatMap((p: any) =>
    p.items.map((pi: any) => {
      const tx = pi.transaction;
      const statusLabel = p.status === "paid" ? "Paid" : p.status === "invoiced" ? "Invoice Received" : "Awaiting Invoice";
      return [
        p.consignor.name, p.consignor.email, tx.orderItem?.order?.orderNumber ?? "", tx.orderItem?.listing?.variant?.product?.title ?? "", tx.orderItem?.listing?.variant?.size ?? "",
        tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : "", tx.grossAmount.toFixed(2), tx.feeAmount.toFixed(2), tx.consignorAmount.toFixed(2), statusLabel, new Date(p.createdAt).toLocaleDateString(),
      ];
    }),
  );
  downloadCsv(`payouts-${label}-${today}.csv`, generateCsv(headers, rows));
}
