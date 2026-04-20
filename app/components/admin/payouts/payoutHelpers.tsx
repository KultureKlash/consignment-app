import type React from "react";
import { fmt } from "~/lib/currency";
import { generateCsv, downloadCsv } from "~/lib/csv";
import { PAYOUT_STATUS } from "~/lib/payout-statuses";

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
  invoiceFileName?: string | null;
  consignorId: string;
  consignor: ConsignorRef;
  items: PayoutItemRef[];
}

// ── Shared Tailwind class strings ──

export const sectionCardClass = "admin-card";
export const sectionHeaderClass = "admin-card-header";
export const sectionTitleClass = "admin-card-title m-0";
export const gridCols = "36px 100px 1fr 100px 90px 90px 90px";

// ── Shared utilities ──

export function relativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── StatCard ──

export function StatCard({ label, value, icon: Icon, accentColor }: { label: string; value: string; icon: React.ElementType; accentColor: string; bgTint: string }) {
  return (
    <div className="relative bg-white border border-gray-200/60 rounded-[10px] px-5 py-[18px] transition-all duration-200 ease-in-out cursor-default shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] hover:border-gray-300/80">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[#6d7175] tracking-[0.01em]">{label}</span>
        <Icon size={20} style={{ color: accentColor }} strokeWidth={1.8} />
      </div>
      <div className="text-2xl font-semibold text-[#1a1a1a] tabular-nums tracking-tight leading-none">
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
      const statusLabel = p.status === PAYOUT_STATUS.PAID ? "Paid" : p.status === PAYOUT_STATUS.INVOICED ? "Invoice Received" : "Awaiting Invoice";
      return [
        p.consignor.name, p.consignor.email, tx.orderItem?.order?.orderNumber ?? "", tx.orderItem?.listing?.variant?.product?.title ?? "", tx.orderItem?.listing?.variant?.size ?? "",
        tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : "", tx.grossAmount.toFixed(2), tx.feeAmount.toFixed(2), tx.consignorAmount.toFixed(2), statusLabel, new Date(p.createdAt).toLocaleDateString(),
      ];
    }),
  );
  downloadCsv(`payouts-${label}-${today}.csv`, generateCsv(headers, rows));
}
