import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getDashboardData } from "~/services/dashboard.server";
import { motion } from "framer-motion";
import { Package, ShoppingBag, TrendingUp, DollarSign, History } from "lucide-react";
import StatsCard from "~/components/StatsCard";
import ActionItem from "~/components/ActionItem";
import ActivityItem from "~/components/ActivityItem";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return getDashboardData();
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

const sectionCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(227,227,227,0.6)",
  borderRadius: "12px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  overflow: "hidden",
};

const sectionHeader: React.CSSProperties = {
  padding: "16px 24px",
  borderBottom: "1px solid rgba(227,227,227,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#1a1a1a",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  margin: 0,
};

export default function Dashboard() {
  const { totalSales, totalOrders, totalCommission, inventoryValue, updatedAt, activityFeed } =
    useLoaderData<typeof loader>();
  const [showAllActivity, setShowAllActivity] = useState(false);
  const visibleFeed = showAllActivity ? activityFeed : activityFeed.slice(0, 5);

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const stats = [
    { label: "Total Sales", value: `$${fmt(Number(totalSales))}`, icon: DollarSign, color: "blue" },
    { label: "Total Orders", value: Number(totalOrders).toLocaleString("en-US"), icon: ShoppingBag, color: "purple" },
    { label: "Total Commission", value: `$${fmt(Number(totalCommission))}`, icon: TrendingUp, color: "green" },
    { label: "Inventory Value", value: `$${fmt(Number(inventoryValue))}`, icon: Package, color: "amber" },
  ];

  return (
    <s-page>
      <div style={{ padding: "0" }}>
        {/* Header */}
        <header style={{ marginBottom: "32px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: 600, letterSpacing: "-0.02em", color: "#1a1a1a", margin: 0 }}>
              Operations
            </h1>
            <p style={{ fontSize: "13px", color: "#6d7175", marginTop: "4px" }}>
              Overview of your consignment ecosystem.
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(109,113,117,0.6)", marginBottom: "4px" }}>
              Last Updated
            </p>
            <p style={{ fontSize: "14px", fontWeight: 500, color: "#1a1a1a", fontVariantNumeric: "tabular-nums", margin: 0 }}>
              {updatedAt}
            </p>
          </div>
        </header>

        <motion.div variants={containerVariants} initial="hidden" animate="visible" style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          {/* Stats Grid */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
            {stats.map((s) => (
              <motion.div key={s.label} variants={itemVariants}>
                <StatsCard {...s} />
              </motion.div>
            ))}
          </section>

          {/* Bottom Two-Column Layout */}
          <div style={{ display: "grid", gridTemplateColumns: "5fr 7fr", gap: "24px" }}>
            {/* Action Required */}
            <motion.section variants={itemVariants}>
              <div style={sectionCard}>
                <div style={sectionHeader}>
                  <h2 style={sectionTitle}>Action Required</h2>
                  <span style={{
                    padding: "2px 8px",
                    background: "#fef2f2",
                    color: "#d72c0d",
                    fontSize: "10px",
                    fontWeight: 700,
                    borderRadius: "9999px",
                    border: "1px solid #fecaca",
                  }}>
                    0 Total
                  </span>
                </div>
                <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <ActionItem label="Awaiting Approval" count={0} color="#2c6ecb" />
                  <ActionItem label="Awaiting Drop-off" count={0} color="#b86e00" />
                  <ActionItem label="Withdrawal Requests" count={0} color="#1a7f37" />
                </div>
              </div>
            </motion.section>

            {/* Activity Feed */}
            <motion.section variants={itemVariants}>
              <div style={sectionCard}>
                <div style={{ ...sectionHeader, justifyContent: "flex-start", gap: "8px" }}>
                  <History size={16} color="rgba(109,113,117,0.6)" />
                  <h2 style={sectionTitle}>Activity Feed</h2>
                </div>
                <div style={{ padding: "12px 24px 24px" }}>
                  {activityFeed.length === 0 ? (
                    <div style={{ color: "#6d7175", fontSize: "14px", padding: "24px 0", textAlign: "center" }}>
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
                          color: "#6d7175",
                          border: "1px solid rgba(227,227,227,0.5)",
                          borderRadius: "8px",
                          background: "transparent",
                          cursor: "pointer",
                          transition: "all 0.2s",
                          fontFamily: "inherit",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#f6f6f7";
                          e.currentTarget.style.color = "#1a1a1a";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "#6d7175";
                        }}
                      >
                        {showAllActivity ? "Show less" : "Show more"}
                      </button>
                    </div>
                  )}
                  <div style={{ textAlign: "center", marginTop: "8px" }}>
                    <Link
                      to="/app/activity"
                      style={{ fontSize: "12px", fontWeight: 600, color: "#6d7175", textDecoration: "none" }}
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
