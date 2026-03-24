import { useState, useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteLoaderData } from "react-router";
import { DollarSign, Package, ShoppingBag, Clock } from "lucide-react";
import { AppHeader } from "~/components/portal/AppHeader";
import { authenticatePortal } from "~/services/portal-auth.server";
import { getConsignorDashboard } from "~/services/portal-dashboard.server";
import { redirect } from "react-router";
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
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");

  const data = await getConsignorDashboard(consignor.id);
  return { consignor, ...data };
}


export default function PortalDashboard() {
  const {
    consignor,
    stats,
    monthlyEarnings,
    currentMonthEarnings,
    listingStatusCounts,
    recentSales,
  } = useLoaderData<typeof loader>();
  const parentData = useRouteLoaderData<typeof portalLoader>("routes/portal");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const statCards = [
    {
      label: "Total Earnings",
      value: `$${stats.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      change: "Available balance",
    },
    {
      label: "Active Listings",
      value: String(stats.activeListings),
      icon: Package,
      change: "Currently listed",
    },
    {
      label: "Items Sold",
      value: String(stats.itemsSold),
      icon: ShoppingBag,
      change: "All time",
    },
    {
      label: "Pending Payouts",
      value: `$${stats.pendingPayouts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: Clock,
      change: `${stats.pendingPayoutCount} pending`,
    },
  ];

  return (
    <div>
      <AppHeader title={`Hi, ${consignor.name.split(" ")[0]}`} subtitle="Welcome to your dashboard" consignorName={consignor.name} notifications={parentData?.notifications} />

      <div className="px-4 md:px-8 pb-8 space-y-4 md:space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {statCards.map((stat, i) => (
            <div
              key={stat.label}
              className="stat-card animate-slide-up !p-3 md:!p-5"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] md:text-sm text-muted-foreground truncate">{stat.label}</p>
                  <p className="text-base md:text-2xl font-bold mt-0.5 md:mt-1 tracking-tight tabular-nums">{stat.value}</p>
                </div>
                <div className="w-7 h-7 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-[rgba(255,255,255,0.06)] flex items-center justify-center shrink-0">
                  <stat.icon className="w-3.5 h-3.5 md:w-5 md:h-5 text-primary" />
                </div>
              </div>
              <p className="text-[10px] md:text-xs text-muted-foreground mt-2 md:mt-3">{stat.change}</p>
            </div>
          ))}
        </div>

        {/* Performance Chart + Listings Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Performance Chart */}
          <div className="lg:col-span-2 glass-panel rounded-2xl p-4 md:p-6 animate-slide-up" style={{ animationDelay: "320ms" }}>
            <div className="flex items-center justify-between mb-3 md:mb-6">
              <div>
                <h2 className="text-sm md:text-lg font-semibold">Performance</h2>
                <p className="text-xs md:text-sm text-muted-foreground">Earnings over time</p>
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
                    formatter={(value) => [`$${Number(value).toLocaleString()}`, "Earnings"]}
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
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Fee</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Payout</th>
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
                      <td className="px-6 py-4 font-medium tabular-nums">${sale.salePrice}</td>
                      <td className="px-6 py-4 text-muted-foreground tabular-nums">${sale.fee.toFixed(2)}</td>
                      <td className="px-6 py-4 font-medium text-primary tabular-nums">${sale.payout.toFixed(2)}</td>
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
