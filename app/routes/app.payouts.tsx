import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useCallback, useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getPayoutsPageData, createPayout, markInvoiced, markPaid, cancelPayout } from "~/services/payouts.server";
import { fmt } from "~/lib/currency";
import {
  DollarSign, Clock, CheckCircle2, ChevronDown, ChevronRight, X, FileText, Download,
} from "lucide-react";
import CustomSelect from "~/components/admin/CustomSelect";
import DateRangeFilter from "~/components/admin/DateRangeFilter";
import { computeTax } from "~/lib/tax";
import { generateCsv, downloadCsv } from "~/lib/csv";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return getPayoutsPageData();
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    switch (intent) {
      case "create": {
        const consignorId = formData.get("consignorId") as string;
        const transactionIds = JSON.parse(formData.get("transactionIds") as string) as string[];
        const payout = await createPayout({ consignorId, transactionIds });
        return { payout, intent };
      }
      case "mark-invoiced": {
        const payoutId = formData.get("payoutId") as string;
        await markInvoiced(payoutId);
        return { intent };
      }
      case "mark-paid": {
        const payoutId = formData.get("payoutId") as string;
        await markPaid(payoutId);
        return { intent };
      }
      case "cancel": {
        const payoutId = formData.get("payoutId") as string;
        await cancelPayout(payoutId);
        return { intent };
      }
      default:
        throw new Error("Invalid intent");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message, intent };
  }
};

// ── Styles ──

const sectionCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(227,227,227,0.6)",
  borderRadius: "12px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  overflow: "hidden",
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid rgba(227,227,227,0.5)",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#1a1a1a",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  margin: 0,
};


function relativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatCard({ label, value, icon: Icon, accentColor }: { label: string; value: string; icon: React.ElementType; accentColor: string; bgTint: string }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: "#fff",
        border: `1px solid ${hovered ? "rgba(200,200,200,0.8)" : "rgba(227,227,227,0.6)"}`,
        borderRadius: "10px",
        padding: "18px 20px",
        transition: "all 0.2s ease",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)"
          : "0 1px 2px rgba(0,0,0,0.03)",
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <span style={{ fontSize: "12px", fontWeight: 500, color: "#6d7175", letterSpacing: "0.01em" }}>{label}</span>
        <Icon size={20} color={accentColor} strokeWidth={1.8} />
      </div>
      <div style={{
        fontSize: "24px",
        fontWeight: 600,
        color: "#1a1a1a",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.025em",
        lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  );
}

// ── Component ──

export default function Payouts() {
  const { unpaidByConsignor, payouts, stats } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [expandedConsignor, setExpandedConsignor] = useState<string | null>(null);
  const [selectedTxs, setSelectedTxs] = useState<Record<string, Set<string>>>({});
  const [expandedPayout, setExpandedPayout] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [filterConsignor, setFilterConsignor] = useState(searchParams.get("consignor") ?? "");
  const [datePreset, setDatePreset] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Build consignor options from all data
  const allConsignorNames = new Map<string, string>();
  for (const entry of unpaidByConsignor) allConsignorNames.set(entry.consignor.id, entry.consignor.name);
  for (const p of payouts) allConsignorNames.set(p.consignorId, p.consignor.name);
  const consignorOptions = [
    { label: "All Consignors", value: "" },
    ...Array.from(allConsignorNames.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ label: name, value: id })),
  ];

  const hasFilters = filterConsignor !== "" || datePreset !== "all";

  // Date range helper
  function getDateRange(): { start?: Date; end?: Date } {
    const now = new Date();
    switch (datePreset) {
      case "today": {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return { start };
      }
      case "7d": {
        const start = new Date();
        start.setDate(start.getDate() - 7);
        return { start };
      }
      case "30d": {
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return { start };
      }
      case "custom": {
        if (filterDateFrom && filterDateTo) {
          const end = new Date(filterDateTo + "T23:59:59");
          return { start: new Date(filterDateFrom + "T00:00:00"), end };
        }
        return {};
      }
      default:
        return {};
    }
  }

  function isInDateRange(dateStr: string | Date): boolean {
    const { start, end } = getDateRange();
    if (!start && !end) return true;
    const d = new Date(dateStr);
    if (start && d < start) return false;
    if (end && d >= end) return false;
    return true;
  }

  // Apply filters
  const filteredUnpaid = unpaidByConsignor
    .filter((e) => !filterConsignor || e.consignor.id === filterConsignor)
    .map((e) => {
      if (datePreset === "all") return e;
      const txs = e.transactions.filter((tx) => isInDateRange(tx.createdAt));
      if (txs.length === 0) return null;
      return { ...e, transactions: txs, total: txs.reduce((sum, tx) => sum + tx.consignorAmount, 0) };
    })
    .filter(Boolean) as typeof unpaidByConsignor;

  const filteredPayouts = payouts.filter((p) => {
    if (filterConsignor && p.consignorId !== filterConsignor) return false;
    if (datePreset !== "all" && !isInDateRange(p.createdAt as unknown as string)) return false;
    return true;
  });

  // Recalculate stats from filtered data
  const filteredStats = {
    totalOutstanding: filteredUnpaid.reduce((sum, e) => sum + e.total, 0),
    totalPending: filteredPayouts.filter((p) => p.status === "pending").reduce((sum, p) => sum + p.amount, 0),
    totalInvoiced: filteredPayouts.filter((p) => p.status === "invoiced").reduce((sum, p) => sum + p.amount, 0),
    totalPaid: filteredPayouts.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0),
  };

  const isSubmitting = ["loading", "submitting"].includes(fetcher.state);

  useEffect(() => {
    const data = fetcher.data as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.error) {
      shopify.toast.show(data.error as string);
    } else if (data.intent === "create") {
      shopify.toast.show("Payout created");
      setSelectedTxs({});
      setExpandedConsignor(null);
    } else if (data.intent === "mark-invoiced") {
      shopify.toast.show("Payout marked as invoiced");
    } else if (data.intent === "mark-paid") {
      shopify.toast.show("Payout marked as paid");
    } else if (data.intent === "cancel") {
      shopify.toast.show("Payout cancelled");
    }
  }, [fetcher.data, shopify]);

  // Scroll expanded section into view
  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setTimeout(() => node.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  }, []);

  const toggleConsignor = (id: string) => {
    setExpandedConsignor(expandedConsignor === id ? null : id);
  };

  const toggleTx = (consignorId: string, txId: string) => {
    setSelectedTxs((prev) => {
      const copy = { ...prev };
      const set = new Set(copy[consignorId] ?? []);
      if (set.has(txId)) set.delete(txId);
      else set.add(txId);
      copy[consignorId] = set;
      return copy;
    });
  };

  const selectAll = (consignorId: string, txIds: string[]) => {
    setSelectedTxs((prev) => {
      const copy = { ...prev };
      const current = copy[consignorId] ?? new Set();
      if (current.size === txIds.length) {
        copy[consignorId] = new Set();
      } else {
        copy[consignorId] = new Set(txIds);
      }
      return copy;
    });
  };

  const handleCreatePayout = (consignorId: string) => {
    const ids = Array.from(selectedTxs[consignorId] ?? []);
    if (ids.length === 0) return;
    fetcher.submit(
      { intent: "create", consignorId, transactionIds: JSON.stringify(ids) },
      { method: "POST" },
    );
  };

  const handleMarkInvoiced = (payoutId: string) => {
    fetcher.submit({ intent: "mark-invoiced", payoutId }, { method: "POST" });
  };

  const handleMarkPaid = (payoutId: string) => {
    fetcher.submit({ intent: "mark-paid", payoutId }, { method: "POST" });
  };

  const handleCancel = (payoutId: string) => {
    fetcher.submit({ intent: "cancel", payoutId }, { method: "POST" });
  };

  const today = new Date().toISOString().slice(0, 10);

  const downloadUnpaid = () => {
    const headers = ["Consignor", "Email", "Order #", "Product", "Size", "Date Sold", "Sale", "Fee", "Payout", "Status"];
    const rows = filteredUnpaid.flatMap((entry) =>
      entry.transactions.map((tx: any) => [
        entry.consignor.name, entry.consignor.email,
        tx.orderItem?.order?.orderNumber ?? "", tx.orderItem?.listing?.variant?.product?.title ?? "", tx.orderItem?.listing?.variant?.size ?? "",
        tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : "",
        tx.grossAmount.toFixed(2), tx.feeAmount.toFixed(2), tx.consignorAmount.toFixed(2), "Unpaid",
      ]),
    );
    downloadCsv(`payouts-unpaid-${today}.csv`, generateCsv(headers, rows));
  };

  const downloadPayouts = (payoutList: any[], label: string) => {
    const headers = ["Consignor", "Email", "Order #", "Product", "Size", "Date Sold", "Sale", "Fee", "Payout", "Status", "Payout Date"];
    const rows = payoutList.flatMap((p: any) =>
      p.items.map((pi: any) => {
        const tx = pi.transaction;
        const statusLabel = p.status === "paid" ? "Paid" : p.status === "invoiced" ? "Invoice Received" : "Awaiting Invoice";
        return [
          p.consignor.name, p.consignor.email,
          tx.orderItem?.order?.orderNumber ?? "", tx.orderItem?.listing?.variant?.product?.title ?? "", tx.orderItem?.listing?.variant?.size ?? "",
          tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : "",
          tx.grossAmount.toFixed(2), tx.feeAmount.toFixed(2), tx.consignorAmount.toFixed(2),
          statusLabel, new Date(p.createdAt).toLocaleDateString(),
        ];
      }),
    );
    downloadCsv(`payouts-${label}-${today}.csv`, generateCsv(headers, rows));
  };

  return (
    <s-page>
      <div style={{ padding: "0" }}>
        <header style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 600, letterSpacing: "-0.02em", color: "#1a1a1a", margin: 0 }}>
            Payouts
          </h1>
          <p style={{ fontSize: "13px", color: "#6d7175", marginTop: "4px" }}>
            Manage consignor payouts and track payment status.
          </p>
        </header>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
          <StatCard label="Outstanding" value={`$${fmt(filteredStats.totalOutstanding)}`} icon={DollarSign} accentColor="#059669" bgTint="#f0fdf4" />
          <StatCard label="Awaiting Invoice" value={`$${fmt(filteredStats.totalPending)}`} icon={Clock} accentColor="#d97706" bgTint="#fffbeb" />
          <StatCard label="Invoice Received" value={`$${fmt(filteredStats.totalInvoiced)}`} icon={FileText} accentColor="#2563eb" bgTint="#eff6ff" />
          <StatCard label="Paid Out" value={`$${fmt(filteredStats.totalPaid)}`} icon={CheckCircle2} accentColor="#059669" bgTint="#ecfdf5" />
        </div>

        {/* Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <div style={{ width: "220px" }}>
            <CustomSelect
              options={consignorOptions}
              value={filterConsignor}
              onChange={setFilterConsignor}
              placeholder="All Consignors"
              searchable
            />
          </div>
          <DateRangeFilter
            preset={datePreset}
            from={filterDateFrom}
            to={filterDateTo}
            onChange={({ dateRange, from, to }) => {
              setDatePreset(dateRange);
              setFilterDateFrom(from ?? "");
              setFilterDateTo(to ?? "");
            }}
          />
          {hasFilters && (
            <button
              onClick={() => { setFilterConsignor(""); setDatePreset("all"); setFilterDateFrom(""); setFilterDateTo(""); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "10px 14px",
                fontSize: "13px",
                fontWeight: 500,
                color: "#6d7175",
                background: "transparent",
                border: "1px solid #c4c9d1",
                borderRadius: "8px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <X size={14} />
              Clear
            </button>
          )}
        </div>

        {/* Unpaid Balances */}
        <div style={{ ...sectionCard, marginBottom: "24px" }}>
          <div style={sectionHeaderStyle}>
            <DollarSign size={15} color="#6d7175" />
            <h2 style={sectionTitleStyle}>Unpaid Balances</h2>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#6d7175" }}>
                {filteredUnpaid.length} consignor{filteredUnpaid.length !== 1 ? "s" : ""}
              </span>
              {filteredUnpaid.length > 0 && (
                <button onClick={downloadUnpaid} title="Download CSV" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "#9ca3af", transition: "color 0.15s" }} onMouseEnter={(e) => { e.currentTarget.style.color = "#1a1a1a"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "#9ca3af"; }}>
                  <Download size={14} />
                </button>
              )}
            </div>
          </div>

          {filteredUnpaid.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#9ca3af", fontSize: "13px" }}>
              All consignors are paid up.
            </div>
          ) : (
            <div>
              {filteredUnpaid.map((entry) => {
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
                            gridTemplateColumns: "36px 100px 1fr 100px 90px 90px 90px",
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
                          const soldDate = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

                          return (
                            <div
                              key={tx.id}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "36px 100px 1fr 100px 90px 90px 90px",
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
                                {order?.orderNumber ?? "—"}
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

        {/* Pending Payouts */}
        {(() => {
          const pendingPayouts = filteredPayouts.filter((p) => p.status !== "paid");
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
                    <button onClick={() => downloadPayouts(pendingPayouts, "pending")} title="Download CSV" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "#9ca3af", transition: "color 0.15s" }} onMouseEnter={(e) => { e.currentTarget.style.color = "#1a1a1a"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "#9ca3af"; }}>
                      <Download size={14} />
                    </button>
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
                            <div style={{ display: "grid", gridTemplateColumns: "36px 100px 1fr 100px 90px 90px 90px", alignItems: "center", padding: "8px 20px 6px 12px", borderBottom: "1px solid rgba(227,227,227,0.3)", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af" }}>
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
                              const soldDate = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
                              return (
                                <div key={pi.id} style={{ display: "grid", gridTemplateColumns: "36px 100px 1fr 100px 90px 90px 90px", alignItems: "center", padding: "7px 20px 7px 12px", borderTop: "1px solid rgba(227,227,227,0.15)", fontSize: "13px" }}>
                                  <span />
                                  <span style={{ fontSize: "12px", color: "#6d7175", fontVariantNumeric: "tabular-nums" }}>{order?.orderNumber ?? "—"}</span>
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
        })()}

        {/* Payout History (paid only) */}
        {(() => {
          const paidPayouts = filteredPayouts.filter((p) => p.status === "paid");
          return (
            <div style={sectionCard}>
              <div style={sectionHeaderStyle}>
                <CheckCircle2 size={15} color="#059669" />
                <h2 style={sectionTitleStyle}>Payout History</h2>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#6d7175" }}>
                    {paidPayouts.length} payout{paidPayouts.length !== 1 ? "s" : ""}
                  </span>
                  {paidPayouts.length > 0 && (
                    <button onClick={() => downloadPayouts(paidPayouts, "history")} title="Download CSV" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "#9ca3af", transition: "color 0.15s" }} onMouseEnter={(e) => { e.currentTarget.style.color = "#1a1a1a"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "#9ca3af"; }}>
                      <Download size={14} />
                    </button>
                  )}
                </div>
              </div>

              {paidPayouts.length === 0 ? (
                <div style={{ padding: "32px 20px", textAlign: "center", color: "#9ca3af", fontSize: "13px" }}>
                  No completed payouts yet.
                </div>
              ) : (
                <div>
                  {paidPayouts.map((payout) => {
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
                            <span style={{ padding: "3px 10px", borderRadius: "9999px", fontSize: "11px", fontWeight: 600, background: "#ecfdf5", color: "#059669", width: "48px", textAlign: "center" }}>
                              Paid
                            </span>
                            <span style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a1a", fontVariantNumeric: "tabular-nums", width: "90px", textAlign: "right" }}>
                              ${fmt(payout.amount)}
                            </span>
                          </div>
                        </div>

                        {isOpen && (
                          <div ref={scrollRef} style={{ background: "#f9fafb", borderTop: "1px solid rgba(227,227,227,0.3)" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "36px 100px 1fr 100px 90px 90px 90px", alignItems: "center", padding: "8px 20px 6px 12px", borderBottom: "1px solid rgba(227,227,227,0.3)", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af" }}>
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
                              const soldDate = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
                              return (
                                <div key={pi.id} style={{ display: "grid", gridTemplateColumns: "36px 100px 1fr 100px 90px 90px 90px", alignItems: "center", padding: "7px 20px 7px 12px", borderTop: "1px solid rgba(227,227,227,0.15)", fontSize: "13px" }}>
                                  <span />
                                  <span style={{ fontSize: "12px", color: "#6d7175", fontVariantNumeric: "tabular-nums" }}>{order?.orderNumber ?? "—"}</span>
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
                                  <span style={{ fontWeight: 700, color: "#1a1a1a" }}>Total Paid ${fmt(tax.total)}</span>
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
        })()}
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
