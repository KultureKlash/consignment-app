import { Link } from "react-router";
import { fmt } from "~/lib/currency";
import { computeTax } from "~/lib/tax";
import {
  ArrowLeft, ShoppingBag, DollarSign,
  TrendingUp, Users, AlertTriangle,
} from "lucide-react";
import { ORDER_STATUS, ORDER_PAYMENT_STATUS, TRANSACTION_TYPE } from "~/lib/order-statuses";
import { OrderItems } from "./OrderItems";
import { OrderLedger } from "./OrderLedger";
import { OrderTimeline } from "./OrderTimeline";
import type { getOrderDetail } from "~/services/orders";

// ── Types ──

type OrderDetailData = Awaited<ReturnType<typeof getOrderDetail>>;

export type OrderDetailPageProps = OrderDetailData;

// ── Helpers ──

function displayOrderName(order: { orderNumber?: string | null; shopifyId?: string | null; id: string }): string {
  if (order.orderNumber) return order.orderNumber;
  if (order.shopifyId) return `#${order.shopifyId.replace("gid://shopify/Order/", "")}`;
  return order.id.slice(0, 8);
}

function getStatusBadge(order: { status: string; paymentStatus: string }): { label: string; bg: string; color: string } {
  if (order.status === ORDER_STATUS.CANCELLED) return { label: "Cancelled", bg: "#fef2f2", color: "#dc2626" };
  if (order.status === ORDER_STATUS.REFUNDED) return { label: "Refunded", bg: "#fffbeb", color: "#d97706" };
  if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) return { label: "Paid", bg: "#ecfdf5", color: "#059669" };
  if (order.paymentStatus === "voided") return { label: "Voided", bg: "#f3f4f6", color: "#6d7175" };
  return { label: "Pending", bg: "#fffbeb", color: "#d97706" };
}

type UnmappedLineItem = { shopifyVariantId: string; quantity: number; price: number; reason: string };

/** Order.unmappedLineItems is a Json column, so narrow it before rendering. */
function readUnmappedLineItems(value: unknown): UnmappedLineItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is UnmappedLineItem =>
      typeof v === "object" && v !== null && typeof (v as UnmappedLineItem).shopifyVariantId === "string",
  );
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

export function OrderDetailPage({ order, summary, timeline }: OrderDetailPageProps) {
  const orderName = displayOrderName(order);
  const orderDate = formatDate(order.createdAt as unknown as string);
  const statusBadge = getStatusBadge(order);
  const unmapped = readUnmappedLineItems(order.unmappedLineItems);

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

        {unmapped.length > 0 && (
          <div className="mb-6 rounded-[10px] border border-amber-300 bg-amber-50 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} color="#d97706" className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="m-0 text-[13px] font-semibold text-amber-900">
                  {unmapped.length} line item{unmapped.length === 1 ? "" : "s"} not tracked by this app
                </p>
                <p className="m-0 mt-1 text-[12px] text-amber-800">
                  These were sold in Shopify but have no matching variant here, so they are excluded
                  from the order total, consignor balances, and inventory sync.
                </p>
                <ul className="m-0 mt-2 list-none p-0">
                  {unmapped.map((item) => (
                    <li
                      key={item.shopifyVariantId}
                      className="text-[12px] text-amber-900 font-mono break-all py-0.5"
                    >
                      {item.shopifyVariantId.replace("gid://shopify/ProductVariant/", "Variant ")}
                      {" — qty "}
                      {item.quantity}
                      {" @ $"}
                      {fmt(item.price)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

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
                if (item.listing.consignor.storeOwned) continue;
                const saleTx = item.transactions.find((tx: any) => tx.type === TRANSACTION_TYPE.SALE);
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
        <OrderItems
          items={order.items}
          paymentStatus={order.paymentStatus}
          itemCount={summary.itemCount}
          refundedCount={summary.refundedCount}
        />

        {/* Two-column: Ledger + Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6">
          <OrderLedger items={order.items} />
          <OrderTimeline timeline={timeline} />
        </div>
      </div>
    </s-page>
  );
}
