import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getOrderDetail } from "~/services/order-queries.server";
import { fmt } from "~/lib/currency";
import { computeTax } from "~/lib/tax";
import {
  ArrowLeft, ShoppingBag, DollarSign,
  TrendingUp, Users, Package, Clock, FileText,
} from "lucide-react";
import { LISTING_STATUS } from "~/lib/listing-statuses";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const id = params.id!;
  return getOrderDetail(id);
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


const statusColors: Record<string, { bg: string; color: string }> = {
  open: { bg: "#ecfdf5", color: "#059669" },
  cancelled: { bg: "#fef2f2", color: "#dc2626" },
  refunded: { bg: "#fffbeb", color: "#d97706" },
  [LISTING_STATUS.SOLD]: { bg: "#ecfdf5", color: "#059669" },
  [LISTING_STATUS.PENDING_SALE]: { bg: "#fffbeb", color: "#d97706" },
};

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

function StatCard({ label, value, subtitle, icon: Icon, accentColor }: { label: string; value: string; subtitle?: string; icon: React.ElementType; accentColor?: string }) {
  return (
    <div
      className="bg-white border border-gray-200/60 rounded-[10px] px-5 py-4"
      style={accentColor ? { borderLeft: `3px solid ${accentColor}` } : undefined}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} color={accentColor ?? "#6d7175"} />
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <div
        className="text-xl font-bold tabular-nums tracking-tight"
        style={{ color: accentColor ?? "#1a1a1a" }}
      >
        {value}
      </div>
      {subtitle && (
        <div className="text-[11px] text-gray-400 mt-1">{subtitle}</div>
      )}
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
      <div className="p-0">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-6">
          <Link
            to="/app/orders"
            className="inline-flex items-center gap-1 text-gray-900 text-xs font-semibold bg-gray-900/[0.06] px-3.5 py-1.5 rounded-[10px] border border-gray-900/15 transition-all duration-200 no-underline hover:bg-gray-900/10"
          >
            <ArrowLeft size={14} />
            Back to Orders
          </Link>
          <span
            className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize tracking-wide inline-block"
            style={{ background: statusBadge.bg, color: statusBadge.color }}
          >
            {statusBadge.label}
          </span>
        </div>

        {/* Order header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-2 tracking-tight">
            Order{" "}
            {order.shopifyId ? (
              <a
                href={`shopify://admin/orders/${order.shopifyId.replace("gid://shopify/Order/", "")}`}
                target="_top"
                className="text-gray-900 no-underline border-b border-dashed border-gray-400 hover:border-gray-900"
              >
                {orderName}
              </a>
            ) : (
              orderName
            )}
          </h1>
          <p className="text-[13px] text-gray-500 m-0">
            {orderDate}
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total" value={`$${fmt(order.total)}`} icon={DollarSign} />
          <StatCard label="Items" value={String(summary.itemCount)} icon={ShoppingBag} />
          <StatCard
            label="Our Cut"
            value={`$${fmt(summary.ourCut)}`}
            icon={TrendingUp}
            accentColor="#059669"
            subtitle={summary.storeOwnedProfit > 0 ? `$${fmt(summary.totalFees)} fees + $${fmt(summary.storeOwnedProfit)} store profit` : undefined}
          />
          <StatCard
            label="Consignor Payouts"
            value={`$${fmt(summary.totalConsignorPayout)}`}
            icon={Users}
            subtitle={(() => {
              let totalWithTax = 0;
              let hasBusiness = false;
              for (const item of order.items) {
                const saleTx = item.transactions.find((tx: any) => tx.type === "sale");
                if (!saleTx) continue;
                const tax = computeTax(saleTx.consignorAmount, item.listing.consignor);
                totalWithTax += tax.total;
                if (tax.isTaxable) hasBusiness = true;
              }
              return hasBusiness ? `$${fmt(totalWithTax)} with tax` : undefined;
            })()}
          />
        </div>

        {/* Items section */}
        <div className="admin-card mb-6">
          <div className="admin-card-header">
            <Package size={15} color="#6d7175" />
            <h2 className="admin-card-title">Items</h2>
            <span className="ml-auto text-[11px] font-semibold text-gray-500">
              {summary.itemCount} item{summary.itemCount !== 1 ? "s" : ""}
              {summary.refundedCount > 0 ? ` · ${summary.refundedCount} refunded` : ""}
            </span>
          </div>
          {/* Desktop table */}
          <table className="hidden md:table w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-gray-200/60">
                <th className="admin-th !px-5">Product</th>
                <th className="admin-th !px-4">Consignor</th>
                <th className="admin-th !px-4 text-center w-[100px]">Status</th>
                <th className="admin-th !px-5 text-right w-[100px]">Price</th>
              </tr>
            </thead>
            <tbody>
            {order.items.map((item, i) => {
              const product = item.listing.variant.product;
              const variant = item.listing.variant;
              const consignor = item.listing.consignor;
              const saleTx = item.transactions.find((tx) => tx.type === "sale");
              const isLast = i === order.items.length - 1;
              const isPending = order.paymentStatus === "pending" && item.status === LISTING_STATUS.SOLD;
              const displayStatus = isPending ? "pending" : item.status;
              const displayColors = isPending
                ? { bg: "#fffbeb", color: "#d97706" }
                : (statusColors[item.status] ?? { bg: "#f3f4f6", color: "#6d7175" });

              return (
                <tr
                  key={item.id}
                  className={isLast ? "" : "border-b border-gray-200/40"}
                >
                  {/* Product info */}
                  <td className="admin-td !px-5 !py-3 align-top">
                    <div className="font-semibold text-[13px] text-gray-900 mb-0.5">
                      {product.shopifyProductId ? (
                        <a
                          href={`shopify://admin/products/${product.shopifyProductId.replace("gid://shopify/Product/", "")}`}
                          target="_top"
                          className="hover:underline"
                        >
                          {product.title}
                        </a>
                      ) : product.title}
                    </div>
                    <div className="text-xs text-gray-500">
                      Size {variant.size}
                      {product.sku && <span className="text-gray-400"> · {product.sku}</span>}
                    </div>
                  </td>
                  {/* Consignor */}
                  <td className="admin-td !px-4 !py-3 align-top">
                    <div className="mb-0.5">
                      <Link to={`/app/consignors/${consignor.id}`} className="text-[13px] font-semibold text-gray-900 no-underline">
                        {consignor.name}
                      </Link>
                      <span className="text-xs text-gray-400"> ({(consignor.feeRate * 100).toFixed(0)}%)</span>
                    </div>
                    {saleTx && (
                      <>
                        <div className="text-xs text-gray-500">
                          Fee <span className="font-semibold text-emerald-600">${fmt(saleTx.feeAmount)}</span>
                          <span className="text-gray-300"> · </span>
                          Payout <span className="font-semibold text-gray-500">${fmt(saleTx.consignorAmount)}</span>
                        </div>
                        {(() => {
                          const tax = computeTax(saleTx.consignorAmount, consignor);
                          if (!tax.isTaxable) return null;
                          return (
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              {tax.gst > 0 && `+GST $${fmt(tax.gst)} `}
                              {tax.qst > 0 && `+QST $${fmt(tax.qst)} `}
                              {tax.hst > 0 && `+${tax.taxLabel} $${fmt(tax.hst)} `}
                              = <strong className="text-gray-500">${fmt(tax.total)}</strong> payable
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </td>
                  {/* Status */}
                  <td className="admin-td !px-4 !py-3 text-center align-top">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize tracking-wide inline-block"
                      style={{ background: displayColors.bg, color: displayColors.color }}
                    >
                      {displayStatus.replace("_", " ")}
                    </span>
                  </td>
                  {/* Price */}
                  <td className="admin-td !px-5 !py-3 text-right align-top font-bold text-sm text-gray-900 tabular-nums whitespace-nowrap">
                    ${fmt(item.price)}
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>

          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-200/40">
            {order.items.map((item) => {
              const product = item.listing.variant.product;
              const variant = item.listing.variant;
              const consignor = item.listing.consignor;
              const saleTx = item.transactions.find((tx) => tx.type === "sale");
              const isPending = order.paymentStatus === "pending" && item.status === LISTING_STATUS.SOLD;
              const displayStatus = isPending ? "pending" : item.status;
              const displayColors = isPending
                ? { bg: "#fffbeb", color: "#d97706" }
                : (statusColors[item.status] ?? { bg: "#f3f4f6", color: "#6d7175" });

              return (
                <div key={item.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[13px] text-gray-900 mb-0.5 truncate">
                        {product.shopifyProductId ? (
                          <a
                            href={`shopify://admin/products/${product.shopifyProductId.replace("gid://shopify/Product/", "")}`}
                            target="_top"
                            className="hover:underline"
                          >
                            {product.title}
                          </a>
                        ) : product.title}
                      </div>
                      <div className="text-xs text-gray-500">
                        Size {variant.size}
                        {product.sku && <span className="text-gray-400"> · {product.sku}</span>}
                      </div>
                    </div>
                    <div className="font-bold text-sm text-gray-900 tabular-nums whitespace-nowrap">
                      ${fmt(item.price)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-gray-500">
                      <Link to={`/app/consignors/${consignor.id}`} className="font-semibold text-gray-900 no-underline">
                        {consignor.name}
                      </Link>
                      <span className="text-gray-400"> ({(consignor.feeRate * 100).toFixed(0)}%)</span>
                    </div>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize tracking-wide inline-block shrink-0"
                      style={{ background: displayColors.bg, color: displayColors.color }}
                    >
                      {displayStatus.replace("_", " ")}
                    </span>
                  </div>
                  {saleTx && (
                    <div className="text-xs text-gray-500">
                      Fee <span className="font-semibold text-emerald-600">${fmt(saleTx.feeAmount)}</span>
                      <span className="text-gray-300"> · </span>
                      Payout <span className="font-semibold text-gray-500">${fmt(saleTx.consignorAmount)}</span>
                      {(() => {
                        const tax = computeTax(saleTx.consignorAmount, consignor);
                        if (!tax.isTaxable) return null;
                        return (
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {tax.gst > 0 && `+GST $${fmt(tax.gst)} `}
                            {tax.qst > 0 && `+QST $${fmt(tax.qst)} `}
                            {tax.hst > 0 && `+${tax.taxLabel} $${fmt(tax.hst)} `}
                            = <strong className="text-gray-500">${fmt(tax.total)}</strong> payable
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

        {/* Two-column: Ledger + Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6">
          {/* Financial Ledger */}
          <div className="admin-card">
            <div className="admin-card-header">
              <FileText size={15} color="#6d7175" />
              <h2 className="admin-card-title">Financial Ledger</h2>
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
                    <div className="px-5 py-6 text-center text-gray-400 text-[13px]">
                      No transactions yet. Payment pending.
                    </div>
                  );
                }

                return (
                  <>
                    {/* Desktop table */}
                    <table className="hidden md:table w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-gray-200/50">
                          <th className="admin-th !px-5 !text-[10px] tracking-wider">Type</th>
                          <th className="admin-th !px-3 !text-[10px] tracking-wider">Item</th>
                          <th className="admin-th !px-3 !text-[10px] tracking-wider text-right">Gross</th>
                          <th className="admin-th !px-3 !text-[10px] tracking-wider text-right">Fee</th>
                          <th className="admin-th !px-5 !text-[10px] tracking-wider text-right">Payout</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allTxs.map((tx, i) => {
                          const colors = txTypeColors[tx.type] ?? { bg: "#f3f4f6", color: "#6d7175" };
                          return (
                            <tr key={i} className="border-b border-gray-200/30">
                              <td className="admin-td !px-5">
                                <span
                                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide inline-block"
                                  style={{ background: colors.bg, color: colors.color }}
                                >
                                  {tx.type.toUpperCase()}
                                </span>
                              </td>
                              <td className="admin-td !px-3 text-gray-700">
                                {tx.productTitle} · {tx.size}
                              </td>
                              <td className="admin-td !px-3 text-right tabular-nums font-medium" style={{ color: tx.grossAmount < 0 ? "#dc2626" : "#1a1a1a" }}>
                                {tx.grossAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.grossAmount))}
                              </td>
                              <td className="admin-td !px-3 text-right tabular-nums font-semibold" style={{ color: tx.feeAmount < 0 ? "#dc2626" : "#059669" }}>
                                {tx.feeAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.feeAmount))}
                              </td>
                              <td className="admin-td !px-5 text-right tabular-nums" style={{ color: tx.consignorAmount < 0 ? "#dc2626" : "#6d7175" }}>
                                {tx.consignorAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.consignorAmount))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Mobile card view */}
                    <div className="md:hidden divide-y divide-gray-200/30">
                      {allTxs.map((tx, i) => {
                        const colors = txTypeColors[tx.type] ?? { bg: "#f3f4f6", color: "#6d7175" };
                        return (
                          <div key={i} className="px-4 py-3 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide inline-block"
                                style={{ background: colors.bg, color: colors.color }}
                              >
                                {tx.type.toUpperCase()}
                              </span>
                              <span className="text-xs text-gray-700 truncate">{tx.productTitle} · {tx.size}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs tabular-nums">
                              <span className="font-medium" style={{ color: tx.grossAmount < 0 ? "#dc2626" : "#1a1a1a" }}>
                                Gross: {tx.grossAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.grossAmount))}
                              </span>
                              <span className="font-semibold" style={{ color: tx.feeAmount < 0 ? "#dc2626" : "#059669" }}>
                                Fee: {tx.feeAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.feeAmount))}
                              </span>
                              <span style={{ color: tx.consignorAmount < 0 ? "#dc2626" : "#6d7175" }}>
                                Payout: {tx.consignorAmount < 0 ? "-" : ""}${fmt(Math.abs(tx.consignorAmount))}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Timeline */}
          <div className="admin-card">
            <div className="admin-card-header">
              <Clock size={15} color="#6d7175" />
              <h2 className="admin-card-title">Timeline</h2>
            </div>
            <div className="p-5">
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
                  <div key={i} className="flex gap-3 relative">
                    {/* Dot + line */}
                    <div className="flex flex-col items-center w-3 shrink-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full border-2 border-white mt-[3px] shrink-0"
                        style={{ background: dotColor, boxShadow: `0 0 0 2px ${dotColor}33` }}
                      />
                      {!isLast && (
                        <div className="w-0.5 flex-1 bg-gray-200/60 min-h-5" />
                      )}
                    </div>
                    {/* Content */}
                    <div className={isLast ? "" : "pb-5"}>
                      <div className="text-[13px] font-medium text-gray-900 leading-snug">
                        {event.label}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
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
