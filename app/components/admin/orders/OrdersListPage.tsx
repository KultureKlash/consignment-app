import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ChevronRight, Search, Download } from "lucide-react";
import CustomSelect from "~/components/admin/CustomSelect";
import DateRangeFilter from "~/components/admin/DateRangeFilter";
import { fmt } from "~/lib/currency";
import { generateCsv, downloadCsv } from "~/lib/csv";
import { ORDER_STATUS, ORDER_PAYMENT_STATUS } from "~/lib/order-statuses";

export const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Paid", value: "paid" },
  { label: "Pending", value: "pending" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Refunded", value: "refunded" },
  { label: "Voided", value: "voided" },
];

function displayOrderName(order: { orderNumber?: string | null; shopifyId?: string | null; id: string }): string {
  if (order.orderNumber) return order.orderNumber;
  if (order.shopifyId) return `#${order.shopifyId.replace("gid://shopify/Order/", "")}`;
  return order.id.slice(0, 8);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).toLowerCase();
  if (isToday) return `Today at ${time}`;
  const date = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${date} at ${time}`;
}

export function getStatusBadge(order: { status: string; paymentStatus: string }): { label: string; bg: string; color: string } {
  if (order.status === ORDER_STATUS.CANCELLED) return { label: "Cancelled", bg: "#fef2f2", color: "#dc2626" };
  if (order.status === ORDER_STATUS.REFUNDED) return { label: "Refunded", bg: "#fffbeb", color: "#d97706" };
  if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) return { label: "Paid", bg: "#ecfdf5", color: "#059669" };
  if (order.paymentStatus === "voided") return { label: "Voided", bg: "#f3f4f6", color: "#6d7175" };
  return { label: "Pending", bg: "#fffbeb", color: "#d97706" };
}

interface OrderItem {
  listing: {
    variant: {
      size: string;
      product: { title: string };
    };
  };
}

interface OrderRow {
  id: string;
  orderNumber?: string | null;
  shopifyId?: string | null;
  createdAt: string;
  total: number;
  status: string;
  paymentStatus: string;
  items: OrderItem[];
}

interface Filters {
  search: string;
  status: string;
  dateRange: string;
  from: string;
  to: string;
}

interface OrdersListPageProps {
  orders: OrderRow[];
  filters: Filters;
}

export default function OrdersListPage({ orders, filters }: OrdersListPageProps) {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(filters.search);

  // Sync search from URL
  useEffect(() => {
    setSearchValue(filters.search);
  }, [filters.search]);

  // Debounced search
  useEffect(() => {
    if (searchValue === filters.search) return;
    const timer = setTimeout(() => {
      updateFilter({ search: searchValue });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchValue]);

  const handleDownloadCsv = () => {
    const headers = ["Order #", "Date", "Total", "Items", "Status"];
    const rows = orders.map((o) => {
      const badge = getStatusBadge(o);
      const itemSummary = o.items.length === 1
        ? `${o.items[0].listing.variant.product.title} (${o.items[0].listing.variant.size})`
        : `${o.items.length} items`;
      return [
        displayOrderName(o),
        formatDate(o.createdAt),
        o.total.toFixed(2),
        itemSummary,
        badge.label,
      ];
    });
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`orders-${today}.csv`, generateCsv(headers, rows));
  };

  function updateFilter(updates: Record<string, string>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v && v !== "all") {
          next.set(k, v);
        } else {
          next.delete(k);
        }
      }
      return next;
    });
  }

  const hasFilters = filters.search || (filters.status !== "all") || (filters.dateRange !== "all");

  return (
    <s-page>
      <div className="p-0">
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 m-0">
            Orders
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            {orders.length} order{orders.length !== 1 ? "s" : ""}
            {hasFilters ? " matching filters" : ""} · Refunds and cancellations sync via webhooks.
          </p>
        </header>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 items-end mb-4">
          {/* Search */}
          <div className="flex-[1_1_240px] relative">
            <span className="admin-search-icon"><Search size={16} /></span>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search by order # or product..."
              className="admin-input-search"
            />
          </div>

          {/* Status */}
          <div className="flex-[0_0_150px]">
            <CustomSelect
              options={STATUS_OPTIONS}
              value={filters.status}
              onChange={(val) => updateFilter({ status: val === filters.status ? "all" : val })}
              placeholder="Status"
            />
          </div>

          {/* Date range */}
          <DateRangeFilter
            preset={filters.dateRange}
            from={filters.from || undefined}
            to={filters.to || undefined}
            onChange={({ dateRange, from, to }) => {
              updateFilter({
                dateRange,
                from: from ?? "",
                to: to ?? "",
              });
            }}
          />

          {/* Clear filters */}
          {hasFilters && (
            <span
              onClick={() => {
                setSearchValue("");
                setSearchParams({});
              }}
              className="text-[13px] text-gray-500 font-medium cursor-pointer py-2.5"
            >
              Clear filters
            </span>
          )}

          {orders.length > 0 && (
            <button
              onClick={handleDownloadCsv}
              title="Download CSV"
              className="bg-transparent border-0 cursor-pointer py-2.5 px-0.5 text-gray-400 transition-colors duration-150 ml-auto hover:text-gray-900"
            >
              <Download size={14} />
            </button>
          )}
        </div>

        {orders.length === 0 ? (
          <div className="admin-card p-10 text-center text-gray-500 text-sm">
            {hasFilters
              ? "No orders match your filters."
              : "No orders yet. Orders will appear here when created in Shopify."}
          </div>
        ) : (
          <>
          {/* Desktop table */}
          <div className="admin-card hidden md:block">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-gray-200/60">
                  <th className="admin-th !px-5">Order</th>
                  <th className="admin-th !px-4">Date</th>
                  <th className="admin-th !px-4">Total</th>
                  <th className="admin-th !px-4">Items</th>
                  <th className="admin-th !px-4">Status</th>
                  <th className="admin-th !px-4 w-8" />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const itemSummary = o.items.length === 1
                    ? `${o.items[0].listing.variant.product.title} · ${o.items[0].listing.variant.size}`
                    : `${o.items.length} items`;
                  const badge = getStatusBadge(o);

                  return (
                    <tr
                      key={o.id}
                      onClick={() => navigate(`/app/orders/${o.id}`)}
                      className="border-b border-gray-200/40 cursor-pointer transition-colors duration-150 hover:bg-gray-50"
                    >
                      <td className="admin-td !px-5 !py-3.5 font-semibold text-gray-900">
                        {displayOrderName(o)}
                      </td>
                      <td className="admin-td !px-4 !py-3.5 text-gray-500">
                        {formatDate(o.createdAt as unknown as string)}
                      </td>
                      <td className="admin-td !px-4 !py-3.5 font-semibold tabular-nums text-gray-900">
                        ${fmt(o.total)}
                      </td>
                      <td className="admin-td !px-4 !py-3.5 text-gray-500">
                        {itemSummary}
                      </td>
                      <td className="admin-td !px-4 !py-3.5">
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide"
                          style={{ background: badge.bg, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="admin-td !px-4 !py-3.5 text-gray-400">
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {orders.map((o) => {
              const itemSummary = o.items.length === 1
                ? `${o.items[0].listing.variant.product.title} · ${o.items[0].listing.variant.size}`
                : `${o.items.length} items`;
              const badge = getStatusBadge(o);

              return (
                <div
                  key={o.id}
                  onClick={() => navigate(`/app/orders/${o.id}`)}
                  className="admin-card p-4 cursor-pointer transition-colors duration-150 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-semibold text-gray-900">
                      {displayOrderName(o)}
                    </span>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-[13px] text-gray-500 mb-1">{itemSummary}</div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-gray-400">{formatDate(o.createdAt as unknown as string)}</span>
                    <span className="font-semibold tabular-nums text-gray-900">${fmt(o.total)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>
    </s-page>
  );
}
