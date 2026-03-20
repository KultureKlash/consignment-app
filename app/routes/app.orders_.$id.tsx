import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getOrderDetail } from "~/services/order-queries.server";
import {
  ArrowLeft, ShoppingBag, DollarSign,
  TrendingUp, Users, Package, Clock, FileText,
} from "lucide-react";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const id = params.id!;
  return getOrderDetail(id);
};

// ── Shared styles ──

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

// ── Helpers ──

function displayOrderName(order: { orderNumber?: string | null; shopifyId?: string | null; id: string }): string {
  if (order.orderNumber) return order.orderNumber;
  if (order.shopifyId) return `#${order.shopifyId.replace("gid://shopify/Order/", "")}`;
  return order.id.slice(0, 8);
}

function getStatusBadge(order: { status: string; paymentStatus: string }): { label: string; bg: string; color: string } {
  if (order.status === "cancelled") return { label: "Cancelled", bg: "#fef2f2", color: "#dc2626" };
  if (order.status === "refunded") return { label: "Refunded", bg: "#fffbeb", color: "#d97706" };
  if (order.paymentStatus === "paid") return { label: "Paid", bg: "#ecfdf5", color: "#059669" };
  if (order.paymentStatus === "voided") return { label: "Voided", bg: "#f3f4f6", color: "#6d7175" };
  return { label: "Pending", bg: "#fffbeb", color: "#d97706" };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date}, ${time}`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const statusColors: Record<string, { bg: string; color: string }> = {
  open: { bg: "#ecfdf5", color: "#059669" },
  cancelled: { bg: "#fef2f2", color: "#dc2626" },
  refunded: { bg: "#fffbeb", color: "#d97706" },
  sold: { bg: "#ecfdf5", color: "#059669" },
  pending_sale: { bg: "#fffbeb", color: "#d97706" },
};

function badge(label: string, colors: { bg: string; color: string }): React.CSSProperties {
  return {
    padding: "3px 10px",
    borderRadius: "9999px",
    fontSize: "11px",
    fontWeight: 600,
    background: colors.bg,
    color: colors.color,
    textTransform: "capitalize",
    letterSpacing: "0.02em",
    display: "inline-block",
  };
}

const txTypeColors: Record<string, { bg: string; color: string }> = {
  sale: { bg: "#ecfdf5", color: "#059669" },
  refund: { bg: "#fffbeb", color: "#d97706" },
  void: { bg: "#fef2f2", color: "#dc2626" },
};

const timelineDotColors: Record<string, string> = {
  created: "#6d7175",
  paid: "#059669",
  refund: "#d97706",
  void: "#dc2626",
};

// ── Stats card ──

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid rgba(227,227,227,0.6)",
      borderRadius: "10px",
      padding: "16px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <Icon size={14} color="#6d7175" />
        <span style={{ fontSize: "11px", fontWeight: 600, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      </div>
      <div style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
        {value}
      </div>
    </div>
  );
}

// ── Component ──

export default function OrderDetail() {
  const { order, summary, timeline } = useLoaderData<typeof loader>();

  const orderName = displayOrderName(order);
  const orderDate = formatDate(order.createdAt as unknown as string);
  const statusBadge = getStatusBadge(order);

  return (
    <s-page>
      <div style={{ padding: "0" }}>
        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <Link
            to="/app/orders"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              color: "#111827",
              fontSize: "12px",
              fontWeight: 600,
              background: "rgba(17,24,39,0.06)",
              padding: "6px 14px",
              borderRadius: "10px",
              border: "1px solid rgba(17,24,39,0.15)",
              transition: "all 0.2s ease",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={14} />
            Back to Orders
          </Link>
          <span style={badge(statusBadge.label, statusBadge)}>
            {statusBadge.label}
          </span>
        </div>

        {/* Order header */}
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#1a1a1a", margin: "0 0 8px 0", letterSpacing: "-0.02em" }}>
            Order{" "}
            {order.shopifyId ? (
              <a
                href={`shopify://admin/orders/${order.shopifyId.replace("gid://shopify/Order/", "")}`}
                target="_top"
                style={{ color: "#1a1a1a", textDecoration: "none", borderBottom: "1px dashed #9ca3af" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = "#1a1a1a"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = "#9ca3af"; }}
              >
                {orderName}
              </a>
            ) : (
              orderName
            )}
          </h1>
          <p style={{ fontSize: "13px", color: "#6d7175", margin: 0 }}>
            {orderDate}
          </p>
        </div>

        {/* Summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
          <StatCard label="Total" value={`$${fmt(order.total)}`} icon={DollarSign} />
          <StatCard label="Items" value={String(summary.itemCount)} icon={ShoppingBag} />
          <StatCard label="Commission" value={`$${fmt(summary.totalFees)}`} icon={TrendingUp} />
          <StatCard label="Consignor Payouts" value={`$${fmt(summary.totalConsignorPayout)}`} icon={Users} />
        </div>

        {/* Items section */}
        <div style={{ ...sectionCard, marginBottom: "24px" }}>
          <div style={sectionHeaderStyle}>
            <Package size={15} color="#6d7175" />
            <h2 style={sectionTitleStyle}>Items</h2>
            <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 600, color: "#6d7175" }}>
              {summary.itemCount} item{summary.itemCount !== 1 ? "s" : ""}
              {summary.refundedCount > 0 ? ` · ${summary.refundedCount} refunded` : ""}
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(227,227,227,0.6)" }}>
                <th style={{ padding: "10px 20px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" }}>Product</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" }}>Consignor</th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontSize: "11px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em", width: "100px" }}>Status</th>
                <th style={{ padding: "10px 20px", textAlign: "right", fontSize: "11px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em", width: "100px" }}>Price</th>
              </tr>
            </thead>
            <tbody>
            {order.items.map((item, i) => {
              const product = item.listing.variant.product;
              const variant = item.listing.variant;
              const consignor = item.listing.consignor;
              const saleTx = item.transactions.find((tx) => tx.type === "sale");
              const isLast = i === order.items.length - 1;
              const isPending = order.paymentStatus === "pending" && item.status === "sold";
              const displayStatus = isPending ? "pending" : item.status;
              const displayColors = isPending
                ? { bg: "#fffbeb", color: "#d97706" }
                : (statusColors[item.status] ?? { bg: "#f3f4f6", color: "#6d7175" });

              return (
                <tr
                  key={item.id}
                  style={{ borderBottom: isLast ? "none" : "1px solid rgba(227,227,227,0.4)" }}
                >
                  {/* Product info */}
                  <td style={{ padding: "12px 20px", verticalAlign: "top" }}>
                    <div style={{ fontWeight: 600, fontSize: "13px", color: "#1a1a1a", marginBottom: "2px" }}>
                      {product.title}
                    </div>
                    <div style={{ fontSize: "12px", color: "#6d7175" }}>
                      Size {variant.size}
                      {product.styleId && <span style={{ color: "#9ca3af" }}> · {product.styleId}</span>}
                    </div>
                  </td>
                  {/* Consignor */}
                  <td style={{ padding: "12px 16px", verticalAlign: "top" }}>
                    <div style={{ marginBottom: "2px" }}>
                      <Link to={`/app/consignors/${consignor.id}`} style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a", textDecoration: "none" }}>
                        {consignor.name}
                      </Link>
                      <span style={{ fontSize: "12px", color: "#9ca3af" }}> ({(consignor.feeRate * 100).toFixed(0)}%)</span>
                    </div>
                    {saleTx && (
                      <div style={{ fontSize: "12px", color: "#6d7175" }}>
                        Fee <span style={{ fontWeight: 600, color: "#1a1a1a" }}>${fmt(saleTx.feeAmount)}</span>
                        <span style={{ color: "#d1d5db" }}> · </span>
                        Payout <span style={{ fontWeight: 600, color: "#059669" }}>${fmt(saleTx.consignorAmount)}</span>
                      </div>
                    )}
                  </td>
                  {/* Status */}
                  <td style={{ padding: "12px 16px", textAlign: "center", verticalAlign: "top" }}>
                    <span style={badge(displayStatus, displayColors)}>
                      {displayStatus.replace("_", " ")}
                    </span>
                  </td>
                  {/* Price */}
                  <td style={{ padding: "12px 20px", textAlign: "right", verticalAlign: "top", fontWeight: 700, fontSize: "14px", color: "#1a1a1a", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    ${fmt(item.price)}
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>

        {/* Two-column: Ledger + Timeline */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "24px" }}>
          {/* Financial Ledger */}
          <div style={sectionCard}>
            <div style={sectionHeaderStyle}>
              <FileText size={15} color="#6d7175" />
              <h2 style={sectionTitleStyle}>Financial Ledger</h2>
            </div>
            <div>
              {(() => {
                const allTxs = order.items.flatMap((item) =>
                  item.transactions.map((tx) => ({
                    ...tx,
                    productTitle: item.listing.variant.product.title,
                    size: item.listing.variant.size,
                  })),
                );
                allTxs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                if (allTxs.length === 0) {
                  return (
                    <div style={{ padding: "24px 20px", textAlign: "center", color: "#9ca3af", fontSize: "13px" }}>
                      No transactions yet. Payment pending.
                    </div>
                  );
                }

                return (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(227,227,227,0.5)" }}>
                        <th style={{ padding: "10px 20px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</th>
                        <th style={{ padding: "10px 12px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Item</th>
                        <th style={{ padding: "10px 12px", textAlign: "right", fontSize: "10px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Gross</th>
                        <th style={{ padding: "10px 12px", textAlign: "right", fontSize: "10px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Fee</th>
                        <th style={{ padding: "10px 20px", textAlign: "right", fontSize: "10px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Payout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allTxs.map((tx, i) => {
                        const colors = txTypeColors[tx.type] ?? { bg: "#f3f4f6", color: "#6d7175" };
                        return (
                          <tr key={i} style={{ borderBottom: "1px solid rgba(227,227,227,0.3)" }}>
                            <td style={{ padding: "10px 20px" }}>
                              <span style={{
                                ...badge(tx.type, colors),
                                fontSize: "10px",
                                padding: "2px 8px",
                              }}>
                                {tx.type.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px", color: "#374151" }}>
                              {tx.productTitle} · {tx.size}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500, color: tx.grossAmount < 0 ? "#dc2626" : "#1a1a1a" }}>
                              {tx.grossAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.grossAmount))}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#6d7175" }}>
                              {tx.feeAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.feeAmount))}
                            </td>
                            <td style={{ padding: "10px 20px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#6d7175" }}>
                              {tx.consignorAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.consignorAmount))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>

          {/* Timeline */}
          <div style={sectionCard}>
            <div style={sectionHeaderStyle}>
              <Clock size={15} color="#6d7175" />
              <h2 style={sectionTitleStyle}>Timeline</h2>
            </div>
            <div style={{ padding: "20px" }}>
              {timeline.map((event, i) => {
                const isLast = i === timeline.length - 1;
                const dotColor = timelineDotColors[event.type] ?? "#6d7175";
                const eventDate = new Date(event.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                });

                return (
                  <div key={i} style={{ display: "flex", gap: "12px", position: "relative" }}>
                    {/* Dot + line */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "12px", flexShrink: 0 }}>
                      <div style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: dotColor,
                        border: "2px solid #fff",
                        boxShadow: `0 0 0 2px ${dotColor}33`,
                        marginTop: "3px",
                        flexShrink: 0,
                      }} />
                      {!isLast && (
                        <div style={{
                          width: "2px",
                          flex: 1,
                          background: "rgba(227,227,227,0.6)",
                          minHeight: "20px",
                        }} />
                      )}
                    </div>
                    {/* Content */}
                    <div style={{ paddingBottom: isLast ? 0 : "20px" }}>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "#1a1a1a", lineHeight: 1.3 }}>
                        {event.label}
                      </div>
                      <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
                        {eventDate}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
