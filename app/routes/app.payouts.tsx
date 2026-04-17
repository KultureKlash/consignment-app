import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useCallback, useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getPayoutsPageData, createPayout, markInvoiced, markPaid, cancelPayout } from "~/services/payouts.server";
import { fmt } from "~/lib/currency";
import { DollarSign, Clock, CheckCircle2, FileText, X } from "lucide-react";
import CustomSelect from "~/components/admin/CustomSelect";
import DateRangeFilter from "~/components/admin/DateRangeFilter";
import prisma from "~/db.server";
import {
  UnpaidSection, PendingSection, HistorySection, StatCard,
  downloadUnpaidCsv, downloadPayoutsCsv,
} from "~/components/admin/payouts";
import type { UnpaidEntry, PayoutRef } from "~/components/admin/payouts";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const [data, allConsignors] = await Promise.all([
    getPayoutsPageData(),
    prisma.consignor.findMany({ where: { storeOwned: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { ...data, allConsignors };
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
        return { payout: await createPayout({ consignorId, transactionIds }), intent };
      }
      case "mark-invoiced": { await markInvoiced(formData.get("payoutId") as string); return { intent }; }
      case "mark-paid": { await markPaid(formData.get("payoutId") as string); return { intent }; }
      case "cancel": { await cancelPayout(formData.get("payoutId") as string); return { intent }; }
      default: throw new Error("Invalid intent");
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error", intent };
  }
};

export default function Payouts() {
  const { unpaidByConsignor, payouts, allConsignors } = useLoaderData<typeof loader>();
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

  const consignorOptions = [{ label: "All Consignors", value: "" }, ...allConsignors.map((c) => ({ label: c.name, value: c.id }))];
  const hasFilters = filterConsignor !== "" || datePreset !== "all";

  function getDateRange(): { start?: Date; end?: Date } {
    const now = new Date();
    switch (datePreset) {
      case "today": return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
      case "7d": { const s = new Date(); s.setDate(s.getDate() - 7); return { start: s }; }
      case "30d": { const s = new Date(); s.setDate(s.getDate() - 30); return { start: s }; }
      case "custom": return filterDateFrom && filterDateTo ? { start: new Date(filterDateFrom + "T00:00:00"), end: new Date(filterDateTo + "T23:59:59") } : {};
      default: return {};
    }
  }
  function isInDateRange(dateStr: string | Date): boolean {
    const { start, end } = getDateRange();
    if (!start && !end) return true;
    const d = new Date(dateStr);
    return !(start && d < start) && !(end && d >= end);
  }

  const filteredUnpaid = (unpaidByConsignor as UnpaidEntry[])
    .filter((e) => !filterConsignor || e.consignor.id === filterConsignor)
    .map((e) => {
      if (datePreset === "all") return e;
      const txs = e.transactions.filter((tx) => isInDateRange(tx.createdAt));
      if (txs.length === 0) return null;
      return { ...e, transactions: txs, total: txs.reduce((sum, tx) => sum + tx.consignorAmount, 0) };
    })
    .filter(Boolean) as UnpaidEntry[];

  const filteredPayouts = (payouts as unknown as PayoutRef[]).filter((p) => {
    if (filterConsignor && p.consignorId !== filterConsignor) return false;
    return datePreset === "all" || isInDateRange(p.createdAt as unknown as string);
  });

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
    const msgs: Record<string, string> = { create: "Payout created", "mark-invoiced": "Payout marked as invoiced", "mark-paid": "Payout marked as paid", cancel: "Payout cancelled" };
    if (data.error) shopify.toast.show(data.error as string);
    else if (data.intent) {
      shopify.toast.show(msgs[data.intent as string] ?? "Done");
      if (data.intent === "create") { setSelectedTxs({}); setExpandedConsignor(null); }
    }
  }, [fetcher.data, shopify]);

  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setTimeout(() => node.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }, []);
  const toggleConsignor = (id: string) => setExpandedConsignor(expandedConsignor === id ? null : id);
  const toggleTx = (cid: string, txId: string) => {
    setSelectedTxs((prev) => { const s = new Set(prev[cid] ?? []); s.has(txId) ? s.delete(txId) : s.add(txId); return { ...prev, [cid]: s }; });
  };
  const selectAll = (cid: string, txIds: string[]) => {
    setSelectedTxs((prev) => ({ ...prev, [cid]: (prev[cid]?.size === txIds.length) ? new Set<string>() : new Set(txIds) }));
  };
  const submit = (data: Record<string, string>) => fetcher.submit(data, { method: "POST" });
  const handleCreatePayout = (cid: string) => { const ids = Array.from(selectedTxs[cid] ?? []); if (ids.length) submit({ intent: "create", consignorId: cid, transactionIds: JSON.stringify(ids) }); };
  const today = new Date().toISOString().slice(0, 10);

  return (
    <s-page>
      <div className="p-0">
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 m-0">Payouts</h1>
          <p className="text-[13px] text-gray-500 mt-1">Manage consignor payouts and track payment status.</p>
        </header>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Outstanding" value={`$${fmt(filteredStats.totalOutstanding)}`} icon={DollarSign} accentColor="#059669" bgTint="#f0fdf4" />
          <StatCard label="Awaiting Invoice" value={`$${fmt(filteredStats.totalPending)}`} icon={Clock} accentColor="#d97706" bgTint="#fffbeb" />
          <StatCard label="Invoice Received" value={`$${fmt(filteredStats.totalInvoiced)}`} icon={FileText} accentColor="#2563eb" bgTint="#eff6ff" />
          <StatCard label="Paid Out" value={`$${fmt(filteredStats.totalPaid)}`} icon={CheckCircle2} accentColor="#059669" bgTint="#ecfdf5" />
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="w-full md:w-[220px]">
            <CustomSelect options={consignorOptions} value={filterConsignor} onChange={setFilterConsignor} placeholder="All Consignors" searchable />
          </div>
          <DateRangeFilter preset={datePreset} from={filterDateFrom} to={filterDateTo} onChange={({ dateRange, from, to }) => { setDatePreset(dateRange); setFilterDateFrom(from ?? ""); setFilterDateTo(to ?? ""); }} />
          {hasFilters && (
            <button
              onClick={() => { setFilterConsignor(""); setDatePreset("all"); setFilterDateFrom(""); setFilterDateTo(""); }}
              className="admin-btn-secondary flex items-center gap-1 !px-3.5 !py-2.5 !text-[13px]"
            >
              <X size={14} /> Clear
            </button>
          )}
        </div>
        <UnpaidSection unpaid={filteredUnpaid} expandedConsignor={expandedConsignor} toggleConsignor={toggleConsignor} selectedTxs={selectedTxs} toggleTx={toggleTx} selectAll={selectAll} handleCreatePayout={handleCreatePayout} isSubmitting={isSubmitting} scrollRef={scrollRef} onDownload={() => downloadUnpaidCsv(filteredUnpaid, today)} />
        <PendingSection payouts={filteredPayouts} expandedPayout={expandedPayout} setExpandedPayout={setExpandedPayout} handleMarkInvoiced={(id) => submit({ intent: "mark-invoiced", payoutId: id })} handleMarkPaid={(id) => submit({ intent: "mark-paid", payoutId: id })} handleCancel={(id) => submit({ intent: "cancel", payoutId: id })} isSubmitting={isSubmitting} scrollRef={scrollRef} onDownload={(list) => downloadPayoutsCsv(list, "pending", today)} />
        <HistorySection payouts={filteredPayouts} expandedPayout={expandedPayout} setExpandedPayout={setExpandedPayout} scrollRef={scrollRef} onDownload={(list) => downloadPayoutsCsv(list, "history", today)} />
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
