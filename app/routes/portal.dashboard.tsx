import { useState, useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteLoaderData } from "react-router";
import { DollarSign, Package, ShoppingBag, Clock, TrendingUp } from "lucide-react";
import { AppHeader } from "~/components/portal/AppHeader";
import { InfoTip } from "~/components/portal/InfoTip";
import { fmt } from "~/lib/currency";
import { authenticatePortal } from "~/services/portal-auth.server";
import { getConsignorDashboard } from "~/services/portal-dashboard.server";
import type { loader as portalLoader } from "./portal";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export async function loader({ request }: LoaderFunctionArgs) {
  // Parent portal.tsx layout guards auth — if no session, return null (parent redirects)
  const consignor = await authenticatePortal(request);
  if (!consignor) return null;

  const data = await getConsignorDashboard(consignor.id, consignor.storeOwned);
  return { ...data };
}


export default function PortalDashboard() {
  const loaderData = useLoaderData<typeof loader>();
  const parentData = useRouteLoaderData<typeof portalLoader>("routes/portal");
  const consignorName = parentData?.consignor.name ?? "";

  // Parent layout handles redirect if not authenticated
  if (!loaderData) return null;

  const {
    storeOwned,
    stats,
    payoutBreakdown,
    monthlyEarnings,
    currentMonthEarnings,
    listingStatusCounts,
    recentSales,
  } = loaderData;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const fmt2 = fmt;

  type StatCard = { label: string; value: string; icon: typeof DollarSign; change: string; tip: string; changeIcon?: typeof TrendingUp; changeColor?: string };
  const statCards: StatCard[] = storeOwned
    ? [
        {
          label: "Total Profit",
          value: `$${fmt2(stats.totalEarnings)}`,
          icon: TrendingUp,
          change: "Revenue minus cost",
          tip: "Total profit from sold items (sale price minus acquisition cost).",
        },
        {
          label: "Active Listings",
          value: String(stats.activeListings),
          icon: Package,
          change: "Currently listed",
          tip: "Items currently listed for sale in the store.",
        },
        {
          label: "Items Sold",
          value: String(stats.itemsSold),
          icon: ShoppingBag,
          change: "All time",
          tip: "Total number of items that have been sold.",
        },
        {
          label: "Total Revenue",
          value: `$${fmt2(stats.totalRevenue ?? 0)}`,
          icon: DollarSign,
          change: `Cost: $${fmt2(stats.totalCost ?? 0)}`,
          tip: "Total revenue from sold items before subtracting acquisition cost.",
        },
      ]
    : [
        {
          label: "Total Earnings",
          value: `$${fmt2(stats.totalEarnings)}`,
          icon: DollarSign,
          change: "Paid out",
          tip: "Total amount that has been paid out to you.",
        },
        {
          label: "Active Listings",
          value: String(stats.activeListings),
          icon: Package,
          change: `$${fmt2(stats.inventoryValue)} Inventory Value`,
          changeIcon: TrendingUp,
          changeColor: "text-[hsl(var(--success))]",
          tip: "Items currently listed for sale. Inventory value is the total asking price of all active listings.",
        },
        {
          label: "Items Sold",
          value: String(stats.itemsSold),
          icon: ShoppingBag,
          change: "All time",
          tip: "Total number of your items that have been sold.",
        },
        {
          label: "Total Sales",
          value: `$${fmt2(stats.totalSalesRevenue)}`,
          icon: TrendingUp,
          change: "Revenue all time",
          tip: "Total sale price of all your sold items.",
        },
      ];

  return (
    <div>
      <AppHeader title={`Hi, ${consignorName.split(" ")[0]}`} subtitle="Welcome to your dashboard" consignorName={consignorName} avatarColor={parentData?.consignor?.avatarColor} notifications={parentData?.notifications} />

      <div className="px-4 md:px-8 pb-8 space-y-4 md:space-y-6">
        {/* Legend + Stats */}
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 animate-slide-up">
          <span className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full bg-amber-400/20">
            <span className="text-[10px] font-bold leading-none text-amber-300">i</span>
          </span>
          Tap for info on what each term means
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {statCards.map((stat, i) => (
            <div
              key={stat.label}
              className="stat-card animate-slide-up !p-3 md:!p-5"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] md:text-sm text-muted-foreground flex items-center gap-1.5">
                    <span className="truncate">{stat.label}</span>
                    <InfoTip text={stat.tip} />
                  </p>
                  <p className="text-base md:text-2xl font-bold mt-0.5 md:mt-1 tracking-tight tabular-nums">{stat.value}</p>
                </div>
                <div className="w-7 h-7 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-[rgba(255,255,255,0.06)] flex items-center justify-center shrink-0">
                  <stat.icon className="w-3.5 h-3.5 md:w-5 md:h-5 text-primary" />
                </div>
              </div>
              <p className={`text-[10px] md:text-xs mt-2 md:mt-3 flex items-center gap-1 ${stat.changeColor ?? "text-muted-foreground"}`}>
                {stat.changeIcon && <stat.changeIcon className="w-3 h-3" />}
                {stat.change}
              </p>
            </div>
          ))}
        </div>

        {/* Payout Breakdown — hidden for store-owned */}
        {!storeOwned && (payoutBreakdown.unbatched > 0 || payoutBreakdown.awaitingInvoice > 0 || payoutBreakdown.invoiceSent > 0) && (
          <div className="glass-panel rounded-2xl p-3 md:p-4 animate-slide-up" style={{ animationDelay: "320ms" }}>
            <p className="text-xs text-muted-foreground mb-2">Payout Breakdown</p>
            <div className="flex flex-wrap gap-4 md:gap-8">
              {payoutBreakdown.unbatched > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Unbatched</span>
                  <span className="text-sm font-medium tabular-nums">${fmt(payoutBreakdown.unbatched)}</span>
                </div>
              )}
              {payoutBreakdown.awaitingInvoice > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[hsl(var(--warning))]" />
                  <span className="text-xs text-muted-foreground">Awaiting Invoice</span>
                  <span className="text-sm font-medium tabular-nums">${fmt(payoutBreakdown.awaitingInvoice)}</span>
                </div>
              )}
              {payoutBreakdown.invoiceSent > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-xs text-muted-foreground">Invoice Received</span>
                  <span className="text-sm font-medium tabular-nums">${fmt(payoutBreakdown.invoiceSent)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Performance Chart + Listings Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Performance Chart */}
          <div className="lg:col-span-2 glass-panel rounded-2xl p-4 md:p-6 animate-slide-up" style={{ animationDelay: "320ms" }}>
            <div className="flex items-center justify-between mb-3 md:mb-6">
              <div>
                <h2 className="text-sm md:text-lg font-semibold">Performance</h2>
                <p className="text-xs md:text-sm text-muted-foreground">{storeOwned ? "Profit over time" : "Earnings over time"}</p>
              </div>
              <div className="text-right">
                <p className="text-lg md:text-2xl font-bold text-primary glow-text">
                  ${currentMonthEarnings.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] md:text-xs text-muted-foreground">This month</p>
              </div>
            </div>
            <div className="h-[150px] md:h-[240px]">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyEarnings}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 20%)" />
                  <XAxis dataKey="month" stroke="hsl(0, 0%, 45%)" tick={{ fontSize: 12 }} />
                  <YAxis stroke="hsl(0, 0%, 45%)" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(0, 0%, 12%)",
                      border: "1px solid hsl(0, 0%, 24%)",
                      borderRadius: "12px",
                      color: "hsl(0, 0%, 92%)",
                      boxShadow: "0 0 20px hsl(0, 0%, 70%, 0.15)",
                    }}
                    formatter={(value) => [`$${Number(value).toLocaleString()}`, storeOwned ? "Profit" : "Earnings"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(0, 0%, 85%)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: "hsl(0, 0%, 95%)", stroke: "hsl(0, 0%, 7%)", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-white/[0.03] rounded-lg animate-pulse" />
            )}
            </div>
          </div>

          {/* Listings Status */}
          <div className="glass-panel rounded-2xl p-6 animate-slide-up" style={{ animationDelay: "400ms" }}>
            <h3 className="text-base font-semibold mb-4">Listings Status</h3>
            {listingStatusCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No listings yet.</p>
            ) : (
              <div className="space-y-4">
                {listingStatusCounts.map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium">{item.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.color} transition-all duration-700`}
                        style={{ width: item.max > 0 ? `${(item.value / item.max) * 100}%` : "0%" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Notifications — commented out, now available via bell in header
        <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "480ms" }}>
          ...
        </div>
        */}

        {/* Recent Sales — desktop only */}
        <div className="hidden lg:block glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "560ms" }}>
          <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
            <h2 className="text-lg font-semibold">Recent Sales</h2>
            <p className="text-sm text-muted-foreground">Your latest transactions</p>
          </div>

          {recentSales.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground text-sm">
              No sales yet. Your sold items will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.08)]">
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Product</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Size</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Sale</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{storeOwned ? "Cost" : "Fee"}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{storeOwned ? "Profit" : "Payout"}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((sale, i) => (
                    <tr
                      key={sale.id}
                      className="table-row-glass border-b border-[rgba(255,255,255,0.04)] animate-fade-in"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <td className="px-6 py-4 font-medium">{sale.product}</td>
                      <td className="px-6 py-4 text-muted-foreground">{sale.size}</td>
                      <td className="px-6 py-4 font-medium tabular-nums">${fmt(sale.salePrice)}</td>
                      <td className="px-6 py-4 text-muted-foreground tabular-nums">
                        {storeOwned ? `$${fmt(sale.cost)}` : `$${fmt(sale.fee)}`}
                      </td>
                      <td className="px-6 py-4 font-medium text-primary tabular-nums">
                        ${storeOwned ? fmt(sale.profit) : fmt(sale.payout)}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground tabular-nums">
                        {new Date(sale.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
