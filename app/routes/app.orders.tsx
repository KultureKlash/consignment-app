import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "~/db.server";
import { ChevronRight, Search } from "lucide-react";
import CustomSelect from "~/components/admin/CustomSelect";
import DateRangeFilter from "~/components/admin/DateRangeFilter";
import { searchInputStyle, searchIconWrap, handleFocus, handleBlurStyle } from "~/lib/admin/listing-ui";
import { fmt } from "~/lib/currency";
import type { Prisma } from "@prisma/client";

const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Paid", value: "paid" },
  { label: "Pending", value: "pending" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Refunded", value: "refunded" },
  { label: "Voided", value: "voided" },
];

function buildStatusWhere(status: string): Prisma.OrderWhereInput {
  switch (status) {
    case "paid":
      return { paymentStatus: "paid", status: { notIn: ["cancelled", "refunded"] } };
    case "pending":
      return { paymentStatus: "pending", status: { notIn: ["cancelled", "refunded"] } };
    case "cancelled":
      return { status: "cancelled" };
    case "refunded":
      return { status: "refunded" };
    case "voided":
      return { paymentStatus: "voided" };
    default:
      return {};
  }
}

function buildDateWhere(dateRange: string, from?: string, to?: string): Prisma.OrderWhereInput {
  const now = new Date();
  switch (dateRange) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { createdAt: { gte: start } };
    }
    case "7d": {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return { createdAt: { gte: start } };
    }
    case "30d": {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return { createdAt: { gte: start } };
    }
    case "custom": {
      if (from && to) {
        const startDate = new Date(from);
        const endDate = new Date(to);
        endDate.setDate(endDate.getDate() + 1); // include the end day
        return { createdAt: { gte: startDate, lt: endDate } };
      }
      return {};
    }
    default:
      return {};
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const status = url.searchParams.get("status") ?? "all";
  const dateRange = url.searchParams.get("dateRange") ?? "all";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  const where: Prisma.OrderWhereInput = {
    ...buildStatusWhere(status),
    ...buildDateWhere(dateRange, from || undefined, to || undefined),
  };

  if (search) {
    where.OR = [
      { orderNumber: { contains: search } },
      { items: { some: { listing: { variant: { product: { title: { contains: search } } } } } } },
    ];
  }

  const orders = await prisma.order.findMany({
    where,
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          listing: {
            include: {
              variant: { include: { product: true } },
            },
          },
        },
      },
    },
  });

  return { orders, filters: { search, status, dateRange, from, to } };
};

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


function getStatusBadge(order: { status: string; paymentStatus: string }): { label: string; bg: string; color: string } {
  if (order.status === "cancelled") return { label: "Cancelled", bg: "#fef2f2", color: "#dc2626" };
  if (order.status === "refunded") return { label: "Refunded", bg: "#fffbeb", color: "#d97706" };
  if (order.paymentStatus === "paid") return { label: "Paid", bg: "#ecfdf5", color: "#059669" };
  if (order.paymentStatus === "voided") return { label: "Voided", bg: "#f3f4f6", color: "#6d7175" };
  return { label: "Pending", bg: "#fffbeb", color: "#d97706" };
}

export default function Orders() {
  const { orders, filters } = useLoaderData<typeof loader>();
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
      <div style={{ padding: "0" }}>
        <header style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 600, letterSpacing: "-0.02em", color: "#1a1a1a", margin: 0 }}>
            Orders
          </h1>
          <p style={{ fontSize: "13px", color: "#6d7175", marginTop: "4px" }}>
            {orders.length} order{orders.length !== 1 ? "s" : ""}
            {hasFilters ? " matching filters" : ""} · Refunds and cancellations sync via webhooks.
          </p>
        </header>

        {/* Filter bar */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end", marginBottom: "16px" }}>
          {/* Search */}
          <div style={{ flex: "1 1 240px", position: "relative" }}>
            <span style={searchIconWrap}><Search size={16} /></span>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlurStyle}
              placeholder="Search by order # or product..."
              style={searchInputStyle}
            />
          </div>

          {/* Status */}
          <div style={{ flex: "0 0 150px" }}>
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
              style={{
                fontSize: "13px",
                color: "#6d7175",
                fontWeight: 500,
                cursor: "pointer",
                padding: "10px 0",
              }}
            >
              Clear filters
            </span>
          )}
        </div>

        {orders.length === 0 ? (
          <div style={{
            background: "#fff",
            border: "1px solid rgba(227,227,227,0.6)",
            borderRadius: "12px",
            padding: "40px",
            textAlign: "center",
            color: "#6d7175",
            fontSize: "14px",
          }}>
            {hasFilters
              ? "No orders match your filters."
              : "No orders yet. Orders will appear here when created in Shopify."}
          </div>
        ) : (
          <div style={{
            background: "#fff",
            border: "1px solid rgba(227,227,227,0.6)",
            borderRadius: "12px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(227,227,227,0.6)" }}>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.04em" }}>Order</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.04em" }}>Date</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.04em" }}>Total</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.04em" }}>Items</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.04em" }}>Status</th>
                  <th style={{ padding: "12px 16px", width: "32px" }} />
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
                      style={{
                        borderBottom: "1px solid rgba(227,227,227,0.4)",
                        cursor: "pointer",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ padding: "14px 20px", fontWeight: 600, color: "#1a1a1a" }}>
                        {displayOrderName(o)}
                      </td>
                      <td style={{ padding: "14px 16px", color: "#6d7175" }}>
                        {formatDate(o.createdAt as unknown as string)}
                      </td>
                      <td style={{ padding: "14px 16px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "#1a1a1a" }}>
                        ${fmt(o.total)}
                      </td>
                      <td style={{ padding: "14px 16px", color: "#6d7175" }}>
                        {itemSummary}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{
                          padding: "3px 10px",
                          borderRadius: "9999px",
                          fontSize: "11px",
                          fontWeight: 600,
                          background: badge.bg,
                          color: badge.color,
                          letterSpacing: "0.02em",
                        }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", color: "#9ca3af" }}>
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
