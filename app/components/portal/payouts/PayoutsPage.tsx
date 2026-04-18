import { useState } from "react";
import { useFetcher, useRouteLoaderData } from "react-router";
import { ChevronDown, ChevronRight, Clock, CheckCircle2, CircleDot, DollarSign, Send, Download } from "lucide-react";
import { AppHeader } from "~/components/portal/AppHeader";
import { InfoTip } from "~/components/portal/InfoTip";
import { DateRangePicker } from "~/components/portal/DateRangePicker";
import { fmt } from "~/lib/currency";
import { computeTax } from "~/lib/tax";
import { downloadStatement } from "~/lib/pdf";
import { PAYOUT_STATUS } from "~/lib/payout-statuses";
import type { loader as portalLoader } from "~/routes/portal";

function StatusBadge({ status, isIndividual }: { status: string; isIndividual?: boolean }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    [PAYOUT_STATUS.PENDING]: isIndividual
      ? { label: "Processing", bg: "bg-[hsl(var(--warning))]/15", text: "text-[hsl(var(--warning))]" }
      : { label: "Awaiting Invoice", bg: "bg-[hsl(var(--warning))]/15", text: "text-[hsl(var(--warning))]" },
    [PAYOUT_STATUS.INVOICED]: { label: "Invoice Sent", bg: "bg-primary/15", text: "text-primary" },
    [PAYOUT_STATUS.PAID]: { label: "Paid", bg: "bg-[hsl(var(--success))]/15", text: "text-[hsl(var(--success))]" },
  };
  const c = config[status] ?? { label: status, bg: "bg-muted", text: "text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}`}>
      {(status === PAYOUT_STATUS.PENDING || status === PAYOUT_STATUS.INVOICED) && <Clock className="w-3 h-3" />}
      {status === PAYOUT_STATUS.PAID && <CheckCircle2 className="w-3 h-3" />}
      {c.label}
    </span>
  );
}

interface PayoutsPageProps {
  consignor: any;
  payouts: any[];
  unbatchedTxs: any[];
  storeOwned: boolean;
}

export function PayoutsPage({ consignor, payouts, unbatchedTxs, storeOwned }: PayoutsPageProps) {
  const parentData = useRouteLoaderData<typeof portalLoader>("routes/portal");
  const fetcher = useFetcher();
  const [expandedPayout, setExpandedPayout] = useState<string | null>(null);
  const [showUnbatched, setShowUnbatched] = useState(false);
  const isSubmitting = ["loading", "submitting"].includes(fetcher.state);

  if (storeOwned) {
    return (
      <div>
        <AppHeader
          title="Payouts"
          subtitle="Payout management"
          consignorName={consignor.name}
          avatarColor={parentData?.consignor?.avatarColor}
          notifications={parentData?.notifications}
        />
        <div className="px-4 md:px-8 pb-8">
          <div className="glass-panel rounded-2xl p-12 text-center">
            <DollarSign className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">Not applicable</p>
            <p className="text-sm text-muted-foreground">
              Payouts don't apply to store-owned inventory. View your profit on the Sales page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isIndividual = consignor.taxStatus !== "business";

  // Date filter state
  const [datePreset, setDatePreset] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const getDateRange = (): { from: Date; to: Date } | null => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (datePreset === "today") return { from: startOfToday, to: now };
    if (datePreset === "7d") return { from: new Date(startOfToday.getTime() - 6 * 86400000), to: now };
    if (datePreset === "30d") return { from: new Date(startOfToday.getTime() - 29 * 86400000), to: now };
    if (datePreset === "custom" && filterDateFrom && filterDateTo) {
      return { from: new Date(filterDateFrom + "T00:00:00"), to: new Date(filterDateTo + "T23:59:59") };
    }
    return null;
  };

  const isInRange = (dateStr: string): boolean => {
    const range = getDateRange();
    if (!range) return true;
    const d = new Date(dateStr);
    return d >= range.from && d <= range.to;
  };

  const filteredUnbatched = unbatchedTxs.filter((tx: any) => isInRange(tx.createdAt));
  const filteredActive = payouts.filter((p) => (p.status === PAYOUT_STATUS.PENDING || p.status === PAYOUT_STATUS.INVOICED) && isInRange(p.createdAt as any));
  const filteredPaid = payouts.filter((p) => p.status === PAYOUT_STATUS.PAID && isInRange(p.createdAt as any));

  const totalActive = filteredActive.reduce((s, p) => s + p.amount, 0);
  const totalPaid = filteredPaid.reduce((s, p) => s + p.amount, 0);
  const totalUnbatched = filteredUnbatched.reduce((s: number, tx: any) => s + tx.consignorAmount, 0);

  const getPeriodLabel = () => {
    if (datePreset === "all") return undefined;
    if (datePreset === "today") return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    if (datePreset === "7d") return "Last 7 days";
    if (datePreset === "30d") return "Last 30 days";
    if (filterDateFrom && filterDateTo) {
      return `${new Date(filterDateFrom + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${new Date(filterDateTo + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return undefined;
  };

  const downloadPayoutItems = (payoutList: any[], label: string) => {
    const headers = ["Product", "Size", "Order #", "Date Sold", "Sale", "Fee", "My Payout", "Payout Date"];
    const rows = payoutList.flatMap((p: any) =>
      p.items.map((pi: any) => {
        const tx = pi.transaction;
        return [
          tx.orderItem?.listing?.variant?.product?.title ?? "Unknown",
          tx.orderItem?.listing?.variant?.size ?? "",
          tx.orderItem?.order?.orderNumber ?? "",
          tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : "",
          `$${tx.grossAmount.toFixed(2)}`, `$${tx.feeAmount.toFixed(2)}`, `$${tx.consignorAmount.toFixed(2)}`,
          new Date(p.createdAt).toLocaleDateString(),
        ];
      }),
    );
    const subtotal = payoutList.reduce((s: number, p: any) => s + p.amount, 0);
    downloadStatement({
      title: `Payout Statement — ${label}`,
      consignorName: consignor.name,
      period: getPeriodLabel(),
      headers, rows,
      totals: { subtotal, consignor },
    });
  };

  return (
    <div>
      <AppHeader title="Payouts" subtitle="Track your earnings and payment status" consignorName={consignor.name} avatarColor={parentData?.consignor?.avatarColor} notifications={parentData?.notifications} />

      <div className="px-4 md:px-8 pb-8 space-y-4 md:space-y-6">
        {/* Legend */}
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 animate-slide-up">
          <span className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full bg-amber-400/20">
            <span className="text-[10px] font-bold leading-none text-amber-300">i</span>
          </span>
          Tap for info on what each term means
        </p>

        {/* Summary stats — Desktop: 3 equal cols, Mobile: 2 cols with Paid Out spanning 2 rows */}
        {/* Desktop */}
        <div className="hidden md:grid grid-cols-3 gap-4">
          {[
            { label: "Unbatched", display: `$${fmt(totalUnbatched)}`, icon: CircleDot, color: "text-muted-foreground", tip: "Sales earnings not yet grouped into a payout by the admin." },
            { label: isIndividual ? "Pending" : "Awaiting Invoice", display: String(filteredActive.length), icon: Clock, color: "text-[hsl(var(--warning))]", tip: isIndividual ? "Number of payouts being processed for payment." : "Number of payouts awaiting your invoice. Send your invoice so we can process payment." },
            { label: "Paid Out", display: `$${fmt(totalPaid)}`, icon: CheckCircle2, color: "text-[hsl(var(--success))]", tip: "Total amount that has been paid to you." },
          ].map((stat, i) => (
            <div key={stat.label} className="stat-card animate-slide-up !p-5" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    {stat.label}
                    <InfoTip text={stat.tip} />
                  </p>
                  <p className="text-2xl font-bold mt-1 tracking-tight tabular-nums">{stat.display}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.06)] flex items-center justify-center shrink-0">
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Mobile: 2-col grid, Paid Out hero card spans right column */}
        <div className="md:hidden grid grid-cols-[1fr_1.2fr] grid-rows-2 gap-3">
          {/* Unbatched — top left */}
          <div className="stat-card animate-slide-up !p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Unbatched</p>
              <InfoTip text="Sales earnings not yet grouped into a payout by the admin." />
            </div>
            <div className="flex items-end justify-between mt-auto pt-3">
              <p className="text-xl font-bold tracking-tight tabular-nums">${fmt(totalUnbatched)}</p>
              <CircleDot className="w-4 h-4 text-muted-foreground/50" />
            </div>
          </div>
          {/* Paid Out — right, hero card spanning 2 rows */}
          <div className="row-span-2 stat-card animate-slide-up !p-4 flex flex-col justify-between border-[hsl(var(--success))]/20" style={{ animationDelay: "160ms", boxShadow: "0 0 30px -8px hsl(152 60% 52% / 0.12)" }}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Paid Out</p>
              <InfoTip text="Total amount that has been paid to you." />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center py-4">
              <div className="w-10 h-10 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))]" />
              </div>
              <p className="text-3xl font-bold tracking-tight tabular-nums">${fmt(totalPaid)}</p>
            </div>
          </div>
          {/* Awaiting Invoice / Pending — bottom left */}
          <div className="stat-card animate-slide-up !p-4 flex flex-col justify-between" style={{ animationDelay: "80ms" }}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{isIndividual ? "Pending" : "Awaiting"}</p>
              <InfoTip text={isIndividual ? "Payouts being processed for payment." : "Payouts awaiting your invoice. Send your invoice so we can process payment."} />
            </div>
            <div className="flex items-end justify-between mt-auto pt-3">
              <p className="text-xl font-bold tracking-tight tabular-nums">{filteredActive.length}</p>
              <Clock className="w-4 h-4 text-[hsl(var(--warning))]/60" />
            </div>
          </div>
        </div>

        {/* Date filter toolbar */}
        <div className="flex items-center justify-between animate-slide-up" style={{ animationDelay: "300ms" }}>
          <DateRangePicker
            preset={datePreset}
            from={filterDateFrom}
            to={filterDateTo}
            onChange={({ dateRange, from, to }) => {
              setDatePreset(dateRange);
              setFilterDateFrom(from ?? "");
              setFilterDateTo(to ?? "");
            }}
          />
        </div>

        {/* Unbatched Sales */}
        {filteredUnbatched.length > 0 && (
          <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "320ms" }}>
            <button
              onClick={() => setShowUnbatched(!showUnbatched)}
              className="w-full flex items-center justify-between px-4 md:px-6 py-4 hover:bg-white/[0.03] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {showUnbatched ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                <div className="text-left">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">Unbatched Sales <InfoTip text="These are your earned commissions from sales that haven't been grouped into a payout yet. The admin will batch them when ready." /></h3>
                  <p className="text-xs text-muted-foreground">{filteredUnbatched.length} sale{filteredUnbatched.length !== 1 ? "s" : ""} not yet in a payout</p>
                </div>
              </div>
              <span className="text-sm font-bold tabular-nums">${fmt(totalUnbatched)}</span>
            </button>
            {showUnbatched && (
              <div className="border-t border-[rgba(255,255,255,0.08)]">
                {/* Mobile: card layout, Desktop: table */}
                <div className="hidden md:block">
                  <div className="grid grid-cols-[1fr_80px_80px_80px_90px] gap-2 px-6 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-[rgba(255,255,255,0.06)]">
                    <span>Product</span>
                    <span className="text-right">Sale</span>
                    <span className="text-right">Fee</span>
                    <span className="text-right">Payout</span>
                    <span className="text-right">Date</span>
                  </div>
                  {filteredUnbatched.map((tx) => (
                    <div key={tx.id} className="grid grid-cols-[1fr_80px_80px_80px_90px] gap-2 px-6 py-3 border-b border-[rgba(255,255,255,0.04)] text-sm">
                      <div className="min-w-0 truncate">
                        <span className="font-medium">{tx.orderItem?.listing?.variant?.product?.title ?? "Unknown"}</span>
                        <span className="text-muted-foreground ml-1">({tx.orderItem?.listing?.variant?.size ?? "?"})</span>
                      </div>
                      <span className="text-right tabular-nums text-muted-foreground">${fmt(tx.grossAmount)}</span>
                      <span className="text-right tabular-nums text-muted-foreground">${fmt(tx.feeAmount)}</span>
                      <span className="text-right tabular-nums font-medium text-[hsl(var(--success))]">${fmt(tx.consignorAmount)}</span>
                      <span className="text-right tabular-nums text-muted-foreground text-xs">
                        {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-[rgba(255,255,255,0.06)]">
                  {filteredUnbatched.map((tx) => (
                    <div key={tx.id} className="px-4 py-3">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-medium truncate mr-2">{tx.orderItem?.listing?.variant?.product?.title ?? "Unknown"}</span>
                        <span className="text-sm font-semibold tabular-nums text-[hsl(var(--success))] shrink-0">${fmt(tx.consignorAmount)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Size {tx.orderItem?.listing?.variant?.size ?? "?"} · Fee ${fmt(tx.feeAmount)}</span>
                        <span>{new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active Payouts (pending + invoiced) */}
        {filteredActive.length > 0 && (
          <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "400ms" }}>
            <div className="px-4 md:px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
              <h3 className="text-sm md:text-base font-semibold flex items-center gap-1.5">Active Payouts <InfoTip text={isIndividual ? "Payouts being processed. You'll be paid directly — no invoice needed." : "Payouts awaiting your invoice. Click 'Mark Invoice Sent' once you've sent it."} /></h3>
              <p className="text-xs text-muted-foreground">{filteredActive.length} payout{filteredActive.length !== 1 ? "s" : ""} in progress</p>
            </div>
            <div className="divide-y divide-[rgba(255,255,255,0.06)]">
              {filteredActive.map((payout) => {
                const isOpen = expandedPayout === payout.id;
                return (
                  <div key={payout.id}>
                    <button
                      onClick={() => setExpandedPayout(isOpen ? null : payout.id)}
                      className="w-full flex items-center gap-3 px-4 md:px-6 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <div className="flex-1 flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 md:gap-3 min-w-0">
                          {payout.status === PAYOUT_STATUS.PENDING && payout.invoiceSent
                            ? <StatusBadge status={PAYOUT_STATUS.INVOICED} />
                            : <StatusBadge status={payout.status} isIndividual={isIndividual} />
                          }
                          <span className="text-xs text-muted-foreground hidden md:inline">
                            {payout.items.length} item{payout.items.length !== 1 ? "s" : ""}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(payout.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-bold tabular-nums">${fmt(payout.amount)}</span>
                          {!isIndividual && (() => {
                            const tax = computeTax(payout.amount, consignor);
                            return tax.isTaxable ? (
                              <div className="text-[10px] text-muted-foreground tabular-nums">${fmt(tax.total)} with tax</div>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-[rgba(255,255,255,0.06)] bg-white/[0.02]">
                        {!isIndividual && payout.status === PAYOUT_STATUS.PENDING && !payout.invoiceSent && (
                          <div className="px-6 md:px-10 py-2.5 border-b border-[rgba(255,255,255,0.06)] flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                fetcher.submit({ intent: "mark-invoice-sent", payoutId: payout.id }, { method: "POST" });
                              }}
                              disabled={isSubmitting}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.08] text-muted-foreground hover:text-foreground hover:bg-white/[0.12] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Send className="w-3 h-3 text-blue-400" />
                              Mark invoice sent
                            </button>
                          </div>
                        )}
                        <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_90px] gap-2 px-10 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-[rgba(255,255,255,0.04)]">
                          <span>Product</span>
                          <span className="text-right">Sale</span>
                          <span className="text-right">Fee</span>
                          <span className="text-right">Payout</span>
                          <span className="text-right">Date</span>
                        </div>
                        {payout.items.map((pi) => {
                          const tx = pi.transaction;
                          const product = tx.orderItem?.listing?.variant?.product;
                          const variant = tx.orderItem?.listing?.variant;
                          return (
                            <div key={pi.id}>
                              {/* Desktop row */}
                              <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_90px] gap-2 px-10 py-2.5 border-b border-[rgba(255,255,255,0.03)] text-sm">
                                <div className="min-w-0 truncate">
                                  <span className="font-medium">{product?.title ?? "Unknown"}</span>
                                  <span className="text-muted-foreground ml-1">({variant?.size ?? "?"})</span>
                                </div>
                                <span className="text-right tabular-nums text-muted-foreground">${fmt(tx.grossAmount)}</span>
                                <span className="text-right tabular-nums text-muted-foreground">${fmt(tx.feeAmount)}</span>
                                <span className="text-right tabular-nums font-medium text-[hsl(var(--success))]">${fmt(tx.consignorAmount)}</span>
                                <span className="text-right tabular-nums text-muted-foreground text-xs">
                                  {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                              </div>
                              {/* Mobile card */}
                              <div className="md:hidden px-6 py-2.5 border-b border-[rgba(255,255,255,0.03)]">
                                <div className="flex justify-between items-start mb-1">
                                  <span className="text-sm font-medium truncate mr-2">{product?.title ?? "Unknown"}</span>
                                  <span className="text-sm font-semibold tabular-nums text-[hsl(var(--success))] shrink-0">${fmt(tx.consignorAmount)}</span>
                                </div>
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Size {variant?.size ?? "?"} · Fee ${fmt(tx.feeAmount)}</span>
                                  <span>{new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {/* Tax summary for business consignors */}
                        {!isIndividual && (() => {
                          const tax = computeTax(payout.amount, consignor);
                          if (!tax.isTaxable) return null;
                          return (
                            <div className="px-6 md:px-10 py-3 border-t border-[rgba(255,255,255,0.06)] bg-white/[0.03]">
                              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs tabular-nums">
                                <span className="text-muted-foreground">Subtotal <strong className="text-foreground">${fmt(tax.subtotal)}</strong></span>
                                {tax.gst > 0 && <span className="text-muted-foreground">GST (5%) <strong className="text-foreground">${fmt(tax.gst)}</strong></span>}
                                {tax.qst > 0 && <span className="text-muted-foreground">QST (9.975%) <strong className="text-foreground">${fmt(tax.qst)}</strong></span>}
                                {tax.hst > 0 && <span className="text-muted-foreground">{tax.taxLabel} <strong className="text-foreground">${fmt(tax.hst)}</strong></span>}
                                <span className="font-bold text-primary">Total Payable ${fmt(tax.total)}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Payout History (paid) */}
        <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "480ms" }}>
          <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
            <div>
              <h3 className="text-sm md:text-base font-semibold">Payout History</h3>
              <p className="text-xs text-muted-foreground">Completed payouts</p>
            </div>
            {filteredPaid.length > 0 && (
              <button onClick={() => downloadPayoutItems(filteredPaid, "Payout History")} title="Download PDF" className="p-1 text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer">
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {filteredPaid.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground text-sm">
              No completed payouts yet. Paid payouts will appear here.
            </div>
          ) : (
            <div className="divide-y divide-[rgba(255,255,255,0.06)]">
              {filteredPaid.map((payout) => {
                const isOpen = expandedPayout === payout.id;
                return (
                  <div key={payout.id}>
                    <button
                      onClick={() => setExpandedPayout(isOpen ? null : payout.id)}
                      className="w-full flex items-center gap-3 px-4 md:px-6 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <div className="flex-1 flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 md:gap-3 min-w-0">
                          <StatusBadge status={PAYOUT_STATUS.PAID} />
                          <span className="text-xs text-muted-foreground hidden md:inline">
                            {payout.items.length} item{payout.items.length !== 1 ? "s" : ""}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(payout.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-bold tabular-nums">${fmt(payout.amount)}</span>
                          {!isIndividual && (() => {
                            const tax = computeTax(payout.amount, consignor);
                            return tax.isTaxable ? (
                              <div className="text-[10px] text-muted-foreground tabular-nums">${fmt(tax.total)} with tax</div>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-[rgba(255,255,255,0.06)] bg-white/[0.02]">
                        <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_90px] gap-2 px-10 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-[rgba(255,255,255,0.04)]">
                          <span>Product</span>
                          <span className="text-right">Sale</span>
                          <span className="text-right">Fee</span>
                          <span className="text-right">Payout</span>
                          <span className="text-right">Date</span>
                        </div>
                        {payout.items.map((pi) => {
                          const tx = pi.transaction;
                          const product = tx.orderItem?.listing?.variant?.product;
                          const variant = tx.orderItem?.listing?.variant;
                          return (
                            <div key={pi.id}>
                              <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_90px] gap-2 px-10 py-2.5 border-b border-[rgba(255,255,255,0.03)] text-sm">
                                <div className="min-w-0 truncate">
                                  <span className="font-medium">{product?.title ?? "Unknown"}</span>
                                  <span className="text-muted-foreground ml-1">({variant?.size ?? "?"})</span>
                                </div>
                                <span className="text-right tabular-nums text-muted-foreground">${fmt(tx.grossAmount)}</span>
                                <span className="text-right tabular-nums text-muted-foreground">${fmt(tx.feeAmount)}</span>
                                <span className="text-right tabular-nums font-medium text-[hsl(var(--success))]">${fmt(tx.consignorAmount)}</span>
                                <span className="text-right tabular-nums text-muted-foreground text-xs">
                                  {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                              </div>
                              <div className="md:hidden px-6 py-2.5 border-b border-[rgba(255,255,255,0.03)]">
                                <div className="flex justify-between items-start mb-1">
                                  <span className="text-sm font-medium truncate mr-2">{product?.title ?? "Unknown"}</span>
                                  <span className="text-sm font-semibold tabular-nums text-[hsl(var(--success))] shrink-0">${fmt(tx.consignorAmount)}</span>
                                </div>
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Size {variant?.size ?? "?"} · Fee ${fmt(tx.feeAmount)}</span>
                                  <span>{new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {/* Tax summary for business consignors */}
                        {!isIndividual && (() => {
                          const tax = computeTax(payout.amount, consignor);
                          if (!tax.isTaxable) return null;
                          return (
                            <div className="px-6 md:px-10 py-3 border-t border-[rgba(255,255,255,0.06)] bg-white/[0.03]">
                              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs tabular-nums">
                                <span className="text-muted-foreground">Subtotal <strong className="text-foreground">${fmt(tax.subtotal)}</strong></span>
                                {tax.gst > 0 && <span className="text-muted-foreground">GST (5%) <strong className="text-foreground">${fmt(tax.gst)}</strong></span>}
                                {tax.qst > 0 && <span className="text-muted-foreground">QST (9.975%) <strong className="text-foreground">${fmt(tax.qst)}</strong></span>}
                                {tax.hst > 0 && <span className="text-muted-foreground">{tax.taxLabel} <strong className="text-foreground">${fmt(tax.hst)}</strong></span>}
                                <span className="font-bold text-primary">Total Paid ${fmt(tax.total)}</span>
                              </div>
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

        {/* Empty state if nothing at all */}
        {payouts.length === 0 && unbatchedTxs.length === 0 && (
          <div className="glass-panel rounded-2xl p-12 text-center animate-slide-up" style={{ animationDelay: "320ms" }}>
            <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">No payouts or pending sales yet.</p>
            <p className="text-xs text-muted-foreground mt-1">When your items sell, payout details will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
