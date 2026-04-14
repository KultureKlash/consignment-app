import { useState, useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteLoaderData, useSearchParams } from "react-router";
import { redirect } from "react-router";
import { Search, DollarSign, ShoppingBag, TrendingUp, CheckCircle2, Clock, CircleDot, RotateCcw, Download } from "lucide-react";
import { AppHeader } from "~/components/portal/AppHeader";
import { DateRangePicker } from "~/components/portal/DateRangePicker";
import { fmt } from "~/lib/currency";
import { downloadStatement } from "~/lib/pdf";
import { authenticatePortal } from "~/services/portal/auth.server";
import { getConsignorSales } from "~/services/portal/sales.server";
import type { loader as portalLoader } from "./portal";

export async function loader({ request }: LoaderFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const status = url.searchParams.get("status") ?? "all";

  const data = await getConsignorSales(consignor.id, {
    search: search || undefined,
    status: status !== "all" ? status : undefined,
  }, { storeOwned: consignor.storeOwned });

  return {
    consignor: { name: consignor.name, taxStatus: consignor.taxStatus, province: consignor.province },
    ...data,
    filters: { search, status },
  };
}


function formatDate(dateStr: string | Date): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "refunded") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-400">
        <RotateCcw className="w-2.5 h-2.5" />
        Refunded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]">
      <CheckCircle2 className="w-2.5 h-2.5" />
      Sold
    </span>
  );
}

function PayoutBadge({ status }: { status: "unbatched" | "pending" | "paid" }) {
  const config = {
    unbatched: { label: "Unbatched", icon: CircleDot, cls: "bg-white/[0.06] text-muted-foreground" },
    pending: { label: "In Payout", icon: Clock, cls: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]" },
    paid: { label: "Paid", icon: CheckCircle2, cls: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.cls}`}>
      <c.icon className="w-2.5 h-2.5" />
      {c.label}
    </span>
  );
}

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "sold", label: "Sold" },
  { key: "refunded", label: "Refunded" },
];

export default function PortalSales() {
  const { consignor, sales, stats, filters, storeOwned } = useLoaderData<typeof loader>();
  const parentData = useRouteLoaderData<typeof portalLoader>("routes/portal");
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(filters.search);
  const [datePreset, setDatePreset] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Sync search from URL
  useEffect(() => { setSearchValue(filters.search); }, [filters.search]);

  // Debounced search
  useEffect(() => {
    if (searchValue === filters.search) return;
    const timer = setTimeout(() => {
      updateFilter({ search: searchValue });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchValue]);

  function updateFilter(updates: Record<string, string>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v && v !== "all") next.set(k, v);
        else next.delete(k);
      }
      return next;
    });
  }

  const activeTab = filters.status || "all";

  // Date filtering
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

  const dateRange = getDateRange();
  const filteredSales = dateRange
    ? sales.filter((s: any) => { const d = new Date(s.date); return d >= dateRange.from && d <= dateRange.to; })
    : sales;

  const handleDownloadPdf = () => {
    const headers = storeOwned
      ? ["Product", "Size", "Order #", "Date", "Sale", "Cost", "Profit"]
      : ["Product", "Size", "Order #", "Date", "Sale", "Fee", "My Payout"];
    const rows = filteredSales.map((s: any) => [
      s.product, s.size, s.orderNumber || "—",
      formatDate(s.date),
      `$${fmt(s.salePrice)}`,
      storeOwned ? `$${fmt(s.cost)}` : `$${fmt(s.fee)}`,
      storeOwned ? `$${fmt(s.profit)}` : `$${fmt(s.payout)}`,
    ]);
    const subtotal = filteredSales.reduce((sum: number, s: any) => sum + (storeOwned ? s.profit : s.payout), 0);
    downloadStatement({
      title: "Sales Report",
      consignorName: consignor.name,
      headers, rows,
      totals: storeOwned ? undefined : { subtotal, consignor: consignor as any },
    });
  };

  return (
    <div>
      <AppHeader
        title="Sales"
        subtitle="Your sold items and earnings"
        consignorName={consignor.name}
        avatarColor={parentData?.consignor?.avatarColor}
        notifications={parentData?.notifications}
      />

      <div className="px-4 md:px-8 pb-8 space-y-4 md:space-y-6">
        {/* Stats — Desktop */}
        <div className="hidden md:grid grid-cols-3 gap-4">
          {[
            { label: storeOwned ? "Total Profit" : "Total Earned", display: `$${fmt(stats.totalEarned)}`, icon: DollarSign, color: "text-[hsl(var(--success))]" },
            { label: "Items Sold", display: String(stats.itemsSold), icon: ShoppingBag, color: "text-primary" },
            { label: "Avg. Sale", display: `$${fmt(stats.avgSale)}`, icon: TrendingUp, color: "text-[hsl(var(--warning))]" },
          ].map((stat, i) => (
            <div key={stat.label} className="stat-card animate-slide-up !p-5" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1 tracking-tight tabular-nums">{stat.display}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.06)] flex items-center justify-center shrink-0">
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Stats — Mobile */}
        <div className="md:hidden grid grid-cols-[1fr_1.2fr] grid-rows-2 gap-3">
          {/* Total Earned — top left */}
          <div className="stat-card animate-slide-up !p-4 flex flex-col justify-between">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{storeOwned ? "Total Profit" : "Total Earned"}</p>
            <div className="flex items-end justify-between mt-auto pt-3">
              <p className="text-xl font-bold tracking-tight tabular-nums">${fmt(stats.totalEarned)}</p>
              <DollarSign className="w-4 h-4 text-[hsl(var(--success))]/50" />
            </div>
          </div>
          {/* Avg Sale — right, hero card spanning 2 rows */}
          <div className="row-span-2 stat-card animate-slide-up !p-4 flex flex-col justify-between" style={{ animationDelay: "160ms" }}>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Avg. Sale</p>
            <div className="flex-1 flex flex-col items-center justify-center py-4">
              <div className="w-10 h-10 rounded-full bg-[hsl(var(--warning))]/10 flex items-center justify-center mb-3">
                <TrendingUp className="w-5 h-5 text-[hsl(var(--warning))]" />
              </div>
              <p className="text-3xl font-bold tracking-tight tabular-nums">${fmt(stats.avgSale)}</p>
            </div>
          </div>
          {/* Items Sold — bottom left */}
          <div className="stat-card animate-slide-up !p-4 flex flex-col justify-between" style={{ animationDelay: "80ms" }}>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Items Sold</p>
            <div className="flex items-end justify-between mt-auto pt-3">
              <p className="text-xl font-bold tracking-tight tabular-nums">{stats.itemsSold}</p>
              <ShoppingBag className="w-4 h-4 text-primary/50" />
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col md:flex-row gap-3 animate-slide-up items-stretch md:items-center" style={{ animationDelay: "240ms" }}>
          {/* Date range */}
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
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search product or order #..."
              className="glass-input w-full pl-10 pr-3 py-2.5 rounded-xl text-sm"
            />
          </div>

          {/* Status tabs */}
          <div className="flex rounded-xl glass-panel p-1 shrink-0">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => updateFilter({ status: tab.key })}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                  activeTab === tab.key
                    ? "bg-white/[0.1] text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {filteredSales.length > 0 && (
            <button onClick={handleDownloadPdf} title="Download PDF" className="p-2 text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer shrink-0">
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sales table / cards */}
        {filteredSales.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center animate-slide-up" style={{ animationDelay: "320ms" }}>
            <ShoppingBag className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {filters.search || filters.status !== "all"
                ? "No sales match your filters."
                : "No sales yet. When your items sell, they'll appear here."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            {/* Desktop table */}
            <div className="hidden md:block glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "320ms" }}>
              <table className="w-full" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-3 px-4" style={{ textAlign: "left" }}>Product</th>
                    <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-3 px-4" style={{ textAlign: "center" }}>Size</th>
                    <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-3 px-4" style={{ textAlign: "left" }}>Order</th>
                    <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-3 px-4" style={{ textAlign: "right" }}>Sale</th>
                    <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-3 px-4" style={{ textAlign: "right" }}>{storeOwned ? "Cost" : "Fee"}</th>
                    <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-3 px-4" style={{ textAlign: "right" }}>{storeOwned ? "Profit" : "Payout"}</th>
                    <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-3 px-4" style={{ textAlign: "left" }}>Date</th>
                    <th className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-3 px-4" style={{ textAlign: "center" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((sale) => (
                    <tr key={sale.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="text-sm font-medium px-4 py-3.5 text-left">{sale.product}</td>
                      <td className="text-sm text-muted-foreground px-4 py-3.5 text-center whitespace-nowrap">{sale.size}</td>
                      <td className="text-sm text-muted-foreground px-4 py-3.5 text-left whitespace-nowrap">{sale.orderNumber || "—"}</td>
                      <td className="text-sm tabular-nums text-right px-4 py-3.5 whitespace-nowrap">${fmt(sale.salePrice)}</td>
                      <td className="text-sm tabular-nums text-right text-muted-foreground px-4 py-3.5 whitespace-nowrap">
                        {storeOwned ? `$${fmt(sale.cost)}` : `-$${fmt(sale.fee)}`}
                      </td>
                      <td className="text-sm tabular-nums text-right font-semibold text-[hsl(var(--success))] px-4 py-3.5 whitespace-nowrap">
                        ${fmt(storeOwned ? sale.profit : sale.payout)}
                      </td>
                      <td className="text-xs text-muted-foreground px-4 py-3.5 text-left whitespace-nowrap">{formatDate(sale.date)}</td>
                      <td className="text-center px-4 py-3.5">
                        <StatusBadge status={sale.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filteredSales.map((sale, i) => (
                <div
                  key={sale.id}
                  className="glass-panel rounded-xl p-4 animate-slide-up"
                  style={{ animationDelay: `${320 + i * 40}ms` }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{sale.product}</p>
                      <p className="text-xs text-muted-foreground">
                        Size {sale.size}{sale.orderNumber ? ` · ${sale.orderNumber}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={sale.status} />
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sale</p>
                      <p className="text-sm font-semibold tabular-nums">${fmt(sale.salePrice)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{storeOwned ? "Cost" : "Fee"}</p>
                      <p className="text-sm tabular-nums text-muted-foreground">
                        {storeOwned ? `$${fmt(sale.cost)}` : `-$${fmt(sale.fee)}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{storeOwned ? "Profit" : "Payout"}</p>
                      <p className="text-sm font-semibold tabular-nums text-[hsl(var(--success))]">
                        ${fmt(storeOwned ? sale.profit : sale.payout)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/[0.04]">
                    <span className="text-[11px] text-muted-foreground">{formatDate(sale.date)}</span>
                    {!storeOwned && <PayoutBadge status={sale.payoutStatus} />}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
