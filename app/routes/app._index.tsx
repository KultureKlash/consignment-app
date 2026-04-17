import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getDashboardData } from "~/services/dashboard.server";
import { motion } from "framer-motion";
import { Package, ShoppingBag, TrendingUp, DollarSign, History, ChevronDown, ChevronUp } from "lucide-react";
import { fmt } from "~/lib/currency";
import StatsCard from "~/components/admin/StatsCard";
import ActionItem from "~/components/admin/ActionItem";
import ActivityItem from "~/components/admin/ActivityItem";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return getDashboardData();
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

export default function Dashboard() {
  const { totalSales, totalOrders, allOrders, consignmentFees, storeProfit, totalEarnings, inventoryValue, submittedCount, awaitingDropoffCount, withdrawalRequestCount, pendingPickupCount, updatedAt, activityFeed } =
    useLoaderData<typeof loader>();
  const [showAllActivity, setShowAllActivity] = useState(false);
  const visibleFeed = showAllActivity ? activityFeed : activityFeed.slice(0, 5);

  const stats = [
    // Col 1: Totals        | Col 2: Earnings breakdown | Col 3: Operations
    { label: "Total Revenue",    value: `$${fmt(Number(totalSales))}`,        icon: DollarSign,  color: "blue",   tip: "Total sale price of all sold items across all consignors." },
    { label: "Consignment Fees", value: `$${fmt(Number(consignmentFees))}`,   icon: TrendingUp,  color: "green",  tip: "Total fees earned from consignment sales (your commission)." },
    { label: "Total Orders", value: Number(totalOrders).toLocaleString("en-US"), sub: Number(allOrders) > Number(totalOrders) ? `${allOrders} total` : undefined, icon: ShoppingBag, color: "purple", tip: "Orders where payment was captured. Grey number includes all orders." },
    { label: "Total Earnings",   value: `$${fmt(Number(totalEarnings))}`,     icon: TrendingUp,  color: "amber",  tip: "Consignment fees + store-owned profit combined." },
    { label: "Store Profit",     value: `$${fmt(Number(storeProfit))}`,       icon: ShoppingBag,  color: "green",  tip: "Profit from store-owned inventory (sale price minus cost)." },
    { label: "Inventory Value",  value: `$${fmt(Number(inventoryValue))}`,    icon: Package,     color: "purple", tip: "Total asking price of all active listings currently for sale." },
  ];

  const actionTotal = submittedCount + awaitingDropoffCount + withdrawalRequestCount + pendingPickupCount;

  return (
    <s-page>
      <div className="p-0">
        {/* Header */}
        <header className="mb-7 flex items-end justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-gray-900 m-0">
              Operations
            </h1>
            <p className="text-[13px] text-slate-400 mt-1 font-normal">
              Overview of your consignment ecosystem.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
              Last Updated
            </p>
            <p className="text-sm font-semibold text-slate-700 tabular-nums m-0">
              {updatedAt}
            </p>
          </div>
        </header>

        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="flex flex-col gap-7">
          {/* Stats Grid — 2 rows of 3 */}
          <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {stats.map((s, i) => (
              <motion.div key={s.label} variants={itemVariants} className={i === stats.length - 1 ? "col-span-2 md:col-span-1" : ""}>
                <StatsCard {...s} />
              </motion.div>
            ))}
          </section>

          {/* Bottom Two-Column Layout */}
          <div className="grid grid-cols-1 md:grid-cols-[5fr_7fr] gap-5">
            {/* Action Required */}
            <motion.section variants={itemVariants}>
              <div className="admin-card">
                <div className="admin-card-header justify-between">
                  <h2 className="admin-card-title">Action Required</h2>
                  <span
                    className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full tabular-nums border ${
                      actionTotal > 0
                        ? "bg-red-50 text-red-600 border-red-600/15"
                        : "bg-slate-50 text-slate-400 border-black/[0.04]"
                    }`}
                  >
                    {actionTotal} Total
                  </span>
                </div>
                <div className="px-2 py-1.5 flex flex-col gap-0.5">
                  <Link to="/app/listings?status=submitted" className="no-underline">
                    <ActionItem label="Awaiting Approval" count={submittedCount} color="#059669" subtitle="Submitted by consignors" />
                  </Link>
                  <Link to="/app/listings?status=approved_awaiting_dropoff" className="no-underline">
                    <ActionItem label="Awaiting Drop-off" count={awaitingDropoffCount} color="#d97706" subtitle="Approved, pending item arrival" />
                  </Link>
                  <Link to="/app/listings?status=withdrawal_requested" className="no-underline">
                    <ActionItem label="Withdrawal Requests" count={withdrawalRequestCount} color="#ea580c" subtitle="Requires review" />
                  </Link>
                  <Link to="/app/listings?status=pending_pickup" className="no-underline">
                    <ActionItem label="Awaiting Pickup" count={pendingPickupCount} color="#0891b2" subtitle="Ready for consignor collection" />
                  </Link>
                </div>
              </div>
            </motion.section>

            {/* Activity Feed */}
            <motion.section variants={itemVariants}>
              <div className="admin-card">
                <div className="admin-card-header justify-start gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                    <History size={14} color="#64748b" strokeWidth={2} />
                  </div>
                  <h2 className="admin-card-title">Activity Feed</h2>
                </div>
                <div className="px-5 py-2 pb-5">
                  {activityFeed.length === 0 ? (
                    <div className="text-slate-400 text-[13px] py-8 text-center">
                      No activity yet. Create your first listing to get started.
                    </div>
                  ) : (
                    visibleFeed.map((item, i) => (
                      <ActivityItem key={i} event={item.event} time={item.time} type={item.type} />
                    ))
                  )}
                  {activityFeed.length > 5 && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => setShowAllActivity(!showAllActivity)}
                        className="flex-1 py-2 px-2 text-xs font-semibold text-slate-500 border border-black/[0.06] rounded-[10px] bg-transparent cursor-pointer transition-all duration-200 font-[inherit] flex items-center justify-center gap-1 hover:bg-slate-50 hover:text-slate-700 hover:border-black/10"
                      >
                        {showAllActivity ? (
                          <><ChevronUp size={14} /> Show less</>
                        ) : (
                          <><ChevronDown size={14} /> Show more</>
                        )}
                      </button>
                    </div>
                  )}
                  <div className="text-center mt-2.5">
                    <Link
                      to="/app/activity"
                      className="text-xs font-semibold text-slate-400 no-underline hover:text-slate-600"
                    >
                      View all activity →
                    </Link>
                  </div>
                </div>
              </div>
            </motion.section>
          </div>
        </motion.div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
