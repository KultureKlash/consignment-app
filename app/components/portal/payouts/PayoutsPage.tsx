import { useEffect, useRef, useState } from "react";
import { useFetcher, useRouteLoaderData } from "react-router";
import { DollarSign } from "lucide-react";
import { AppHeader } from "~/components/portal/AppHeader";
import { DateRangePicker } from "~/components/portal/DateRangePicker";
import { downloadStatement } from "~/lib/pdf";
import { fmt } from "~/lib/currency";
import { PAYOUT_STATUS } from "~/lib/payout-statuses";
import { PayoutsSummary } from "./PayoutsSummary";
import { UnbatchedSection } from "./UnbatchedSection";
import { ActivePayouts } from "./ActivePayouts";
import { PaidHistory } from "./PaidHistory";
import type { loader as portalLoader } from "~/routes/portal";

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

  // Per-payout upload feedback: which one is uploading + briefly flash success after
  const [activePayoutId, setActivePayoutId] = useState<string | null>(null);
  const [recentlySavedId, setRecentlySavedId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const lastFetcherStateRef = useRef(fetcher.state);
  useEffect(() => {
    const wasBusy = ["loading", "submitting"].includes(lastFetcherStateRef.current);
    const nowIdle = fetcher.state === "idle";
    if (wasBusy && nowIdle && activePayoutId) {
      const data = fetcher.data as { ok?: boolean; error?: string } | undefined;
      if (data?.ok) {
        setRecentlySavedId(activePayoutId);
        setActivePayoutId(null);
        setUploadError(null);
        const t = setTimeout(() => setRecentlySavedId(null), 2000);
        return () => clearTimeout(t);
      }
      if (data?.error) {
        setUploadError(data.error);
        setActivePayoutId(null);
        const t = setTimeout(() => setUploadError(null), 5000);
        return () => clearTimeout(t);
      }
      setActivePayoutId(null);
    }
    lastFetcherStateRef.current = fetcher.state;
  }, [fetcher.state, fetcher.data, activePayoutId]);

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
  const [datePreset, setDatePreset] = useState("30d");
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

  const handleUploadInvoice = (payoutId: string, file: File) => {
    const fd = new FormData();
    fd.append("intent", "upload-invoice");
    fd.append("payoutId", payoutId);
    fd.append("invoice", file);
    setActivePayoutId(payoutId);
    fetcher.submit(fd, { method: "POST", encType: "multipart/form-data" });
  };

  const handleDeleteInvoice = (payoutId: string) => {
    if (!confirm("Delete this invoice? You'll need to upload a new one.")) return;
    setActivePayoutId(payoutId);
    fetcher.submit({ intent: "delete-invoice", payoutId }, { method: "POST" });
  };

  const handleTogglePayout = (id: string) => {
    setExpandedPayout(expandedPayout === id ? null : id);
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

        {/* Summary stats */}
        <PayoutsSummary
          totalUnbatched={totalUnbatched}
          activeCount={filteredActive.length}
          totalPaid={totalPaid}
          isIndividual={isIndividual}
        />

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
        <UnbatchedSection
          transactions={filteredUnbatched}
          totalAmount={totalUnbatched}
          expanded={showUnbatched}
          onToggle={() => setShowUnbatched(!showUnbatched)}
        />

        {/* Upload error banner — auto-dismisses */}
        {uploadError && (
          <div className="glass-panel rounded-2xl px-4 py-3 border border-red-500/30 bg-red-500/10 text-sm text-red-300 animate-slide-up">
            {uploadError}
          </div>
        )}

        {/* Active Payouts (pending + invoiced) */}
        <ActivePayouts
          payouts={filteredActive}
          consignor={consignor}
          isIndividual={isIndividual}
          expandedPayout={expandedPayout}
          onTogglePayout={handleTogglePayout}
          isSubmitting={isSubmitting}
          onUploadInvoice={handleUploadInvoice}
          onDeleteInvoice={handleDeleteInvoice}
          uploadingPayoutId={activePayoutId}
          recentlySavedPayoutId={recentlySavedId}
        />

        {/* Payout History (paid) */}
        <PaidHistory
          payouts={filteredPaid}
          consignor={consignor}
          isIndividual={isIndividual}
          expandedPayout={expandedPayout}
          onTogglePayout={handleTogglePayout}
          onDownload={() => downloadPayoutItems(filteredPaid, "Payout History")}
        />

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
