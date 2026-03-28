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

const sectionCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(0, 0, 0, 0.06)",
  borderRadius: "14px",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
  overflow: "hidden",
};

const sectionHeader: React.CSSProperties = {
  padding: "16px 22px",
  borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  margin: 0,
};

export default function Dashboard() {
  const { totalSales, totalOrders, consignmentFees, storeProfit, totalEarnings, inventoryValue, submittedCount, awaitingDropoffCount, withdrawalRequestCount, updatedAt, activityFeed } =
    useLoaderData<typeof loader>();
  const [showAllActivity, setShowAllActivity] = useState(false);
  const visibleFeed = showAllActivity ? activityFeed : activityFeed.slice(0, 5);

  const stats = [
    // Col 1: Totals        | Col 2: Earnings breakdown | Col 3: Operations
    { label: "Total Revenue",    value: `$${fmt(Number(totalSales))}`,        icon: DollarSign,  color: "blue"   },
    { label: "Consignment Fees", value: `$${fmt(Number(consignmentFees))}`,   icon: TrendingUp,  color: "green"  },
    { label: "Total Orders",     value: Number(totalOrders).toLocaleString("en-US"), icon: ShoppingBag, color: "purple" },
    { label: "Total Earnings",   value: `$${fmt(Number(totalEarnings))}`,     icon: TrendingUp,  color: "amber"  },
    { label: "Store Profit",     value: `$${fmt(Number(storeProfit))}`,       icon: ShoppingBag,  color: "green"  },
    { label: "Inventory Value",  value: `$${fmt(Number(inventoryValue))}`,    icon: Package,     color: "purple" },
  ];

  const actionTotal = submittedCount + awaitingDropoffCount + withdrawalRequestCount;

  return (
    <s-page>
      <div style={{ padding: "0" }}>
        {/* Header */}
        <header style={{ marginBottom: "28px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.025em", color: "#0f172a", margin: 0 }}>
              Operations
            </h1>
            <p style={{ fontSize: "13px", color: "#94a3b8", marginTop: "4px", fontWeight: 400 }}>
              Overview of your consignment ecosystem.
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", margin: "0 0 2px" }}>
              Last Updated
            </p>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "#334155", fontVariantNumeric: "tabular-nums", margin: 0 }}>
              {updatedAt}
            </p>
          </div>
        </header>

        <motion.div variants={containerVariants} initial="hidden" animate="visible" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          {/* Stats Grid — 2 rows of 3 */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            {stats.map((s) => (
              <motion.div key={s.label} variants={itemVariants}>
                <StatsCard {...s} />
              </motion.div>
            ))}
          </section>

          {/* Bottom Two-Column Layout */}
          <div style={{ display: "grid", gridTemplateColumns: "5fr 7fr", gap: "20px" }}>
            {/* Action Required */}
            <motion.section variants={itemVariants}>
              <div style={sectionCard}>
                <div style={sectionHeader}>
                  <h2 style={sectionTitle}>Action Required</h2>
                  <span style={{
                    padding: "3px 10px",
                    background: actionTotal > 0 ? "#fef2f2" : "#f8fafc",
                    color: actionTotal > 0 ? "#dc2626" : "#94a3b8",
                    fontSize: "11px",
                    fontWeight: 700,
                    borderRadius: "9999px",
                    border: `1px solid ${actionTotal > 0 ? "rgba(220, 38, 38, 0.15)" : "rgba(0, 0, 0, 0.04)"}`,
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {actionTotal} Total
                  </span>
                </div>
                <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <Link to="/app/listings?status=submitted" style={{ textDecoration: "none" }}>
                    <ActionItem label="Awaiting Approval" count={submittedCount} color="#2563eb" subtitle="Submitted by consignors" />
                  </Link>
                  <Link to="/app/listings?status=approved_awaiting_dropoff" style={{ textDecoration: "none" }}>
                    <ActionItem label="Awaiting Drop-off" count={awaitingDropoffCount} color="#d97706" subtitle="Approved, pending item arrival" />
                  </Link>
                  <Link to="/app/listings?status=withdrawal_requested" style={{ textDecoration: "none" }}>
                    <ActionItem label="Withdrawal Requests" count={withdrawalRequestCount} color="#ea580c" subtitle="Requires review" />
                  </Link>
                </div>
              </div>
            </motion.section>

            {/* Activity Feed */}
            <motion.section variants={itemVariants}>
              <div style={sectionCard}>
                <div style={{ ...sectionHeader, justifyContent: "flex-start", gap: "8px" }}>
                  <div style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "8px",
                    background: "#f1f5f9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <History size={14} color="#64748b" strokeWidth={2} />
                  </div>
                  <h2 style={sectionTitle}>Activity Feed</h2>
                </div>
                <div style={{ padding: "8px 22px 20px" }}>
                  {activityFeed.length === 0 ? (
                    <div style={{ color: "#94a3b8", fontSize: "13px", padding: "32px 0", textAlign: "center" }}>
                      No activity yet. Create your first listing to get started.
                    </div>
                  ) : (
                    visibleFeed.map((item, i) => (
                      <ActivityItem key={i} event={item.event} time={item.time} type={item.type} />
                    ))
                  )}
                  {activityFeed.length > 5 && (
                    <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                      <button
                        onClick={() => setShowAllActivity(!showAllActivity)}
                        style={{
                          flex: 1,
                          padding: "8px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#64748b",
                          border: "1px solid rgba(0, 0, 0, 0.06)",
                          borderRadius: "10px",
                          background: "transparent",
                          cursor: "pointer",
                          transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                          fontFamily: "inherit",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#f8fafc";
                          e.currentTarget.style.color = "#334155";
                          e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "#64748b";
                          e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.06)";
                        }}
                      >
                        {showAllActivity ? (
                          <><ChevronUp size={14} /> Show less</>
                        ) : (
                          <><ChevronDown size={14} /> Show more</>
                        )}
                      </button>
                    </div>
                  )}
                  <div style={{ textAlign: "center", marginTop: "10px" }}>
                    <Link
                      to="/app/activity"
                      style={{ fontSize: "12px", fontWeight: 600, color: "#94a3b8", textDecoration: "none" }}
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
