import { useState } from "react";
import { Package, ChevronRight } from "lucide-react";
import { thStyle, tdStyle, statusBadge, relativeTime, statusLabel } from "~/lib/listing-ui";
import { compareSizes } from "~/lib/size-order";

type Listing = {
  id: string;
  price: number | { toFixed: (digits: number) => string };
  status: string;
  createdAt: string | Date;
  consignor: { name: string; email: string };
  variant: {
    size: string;
    gtin: string | null;
    product: { id: string; title: string; styleId: string | null; brand: string | null; imageUrl?: string | null };
  };
};

type SortKey = "date" | "price" | "status";

type ProductGroup = {
  productId: string;
  title: string;
  styleId: string | null;
  brand: string | null;
  imageUrl: string | null;
  listings: Listing[];
};

type Props = {
  listings: Listing[];
  grouped?: boolean;
  onCancel?: (listingId: string) => void;
  isLoading?: boolean;
  isNavigating?: boolean;
  sortBy?: SortKey;
  sortDir?: "asc" | "desc";
  onSortChange?: (sortBy: SortKey) => void;
};

// ── Shared styles ──

const sortableThStyle: React.CSSProperties = {
  ...thStyle,
  cursor: "pointer",
  userSelect: "none",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  borderSpacing: 0,
};

const flatRowStyle: React.CSSProperties = {
  borderBottom: "1px solid #f0f0f0",
  transition: "background 0.12s ease-out",
};

// ── Grouped view styles ──

const groupHeaderStyle: React.CSSProperties = {
  cursor: "pointer",
  userSelect: "none",
  borderBottom: "1px solid #e2e5ea",
  background: "#ffffff",
  transition: "background 0.15s ease-out",
};

const groupHeaderCellStyle: React.CSSProperties = {
  padding: "12px 12px 12px 8px",
};

const chevronWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "24px",
  height: "24px",
  marginRight: "10px",
  borderRadius: "6px",
  transition: "transform 0.2s ease-out, background 0.15s ease-out",
  color: "#6d7175",
  flexShrink: 0,
};

const qtyBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 10px",
  fontSize: "12px",
  fontWeight: 600,
  borderRadius: "6px",
  background: "#f0f0f2",
  color: "#6d7175",
  letterSpacing: "0.01em",
};

const childRowStyle: React.CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
  background: "#fcfcfd",
  transition: "background 0.12s ease-out",
};

const childIndentTd: React.CSSProperties = {
  ...tdStyle,
  paddingLeft: "42px",
};

// ── Helpers ──

function SortIndicator({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span style={{ color: "#d1d5db", marginLeft: "4px", fontSize: "10px" }}>↕</span>;
  return <span style={{ marginLeft: "4px", fontSize: "10px" }}>{dir === "asc" ? "↑" : "↓"}</span>;
}

function groupByProduct(listings: Listing[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();
  for (const l of listings) {
    const pid = l.variant.product.id;
    let group = map.get(pid);
    if (!group) {
      group = {
        productId: pid,
        title: l.variant.product.title,
        styleId: l.variant.product.styleId,
        brand: l.variant.product.brand,
        imageUrl: l.variant.product.imageUrl ?? null,
        listings: [],
      };
      map.set(pid, group);
    }
    group.listings.push(l);
  }
  // Sort child listings by size within each group
  for (const group of map.values()) {
    group.listings.sort((a, b) => compareSizes(a.variant.size, b.variant.size));
  }
  return Array.from(map.values());
}

function statusSummary(listings: Listing[]): string {
  const active = listings.filter((l) => l.status === "active").length;
  const sold = listings.filter((l) => l.status === "sold").length;
  const parts: string[] = [];
  if (active) parts.push(`${active} active`);
  if (sold) parts.push(`${sold} sold`);
  if (parts.length === 0) return `${listings.length} listing${listings.length !== 1 ? "s" : ""}`;
  return parts.join(", ");
}

// ── Component ──

export default function ListingsTable({
  listings,
  grouped,
  onCancel,
  isLoading,
  isNavigating,
  sortBy,
  sortDir = "desc",
  onSortChange,
}: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  if (listings.length === 0 && !isNavigating) {
    return (
      <div style={{ textAlign: "center", padding: "48px 20px" }}>
        <Package size={44} color="#d1d5db" style={{ marginBottom: "14px" }} />
        <p style={{ fontSize: "14px", color: "#6d7175", margin: 0, lineHeight: 1.5 }}>
          No listings found.
        </p>
      </div>
    );
  }

  const wrapperStyle: React.CSSProperties = {
    overflowX: "auto",
    ...(isNavigating
      ? { opacity: 0.5, pointerEvents: "none", transition: "opacity 0.15s ease-out" }
      : { transition: "opacity 0.15s ease-out" }),
  };

  const toggleGroup = (productId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const colCount = onCancel ? 7 : 6;

  // ── Grouped view ──
  if (grouped) {
    const groups = groupByProduct(listings);

    return (
      <div style={wrapperStyle}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e2e5ea" }}>
              <th
                style={onSortChange ? { ...sortableThStyle, paddingLeft: "42px" } : { ...thStyle, paddingLeft: "42px" }}
                onClick={() => onSortChange?.("date")}
              >
                Size
                {onSortChange && <SortIndicator active={sortBy === "date"} dir={sortDir} />}
              </th>
              <th style={thStyle}>Barcode</th>
              <th style={onSortChange ? sortableThStyle : thStyle} onClick={() => onSortChange?.("price")}>
                Price
                {onSortChange && <SortIndicator active={sortBy === "price"} dir={sortDir} />}
              </th>
              <th style={thStyle}>Consignor</th>
              <th style={onSortChange ? sortableThStyle : thStyle} onClick={() => onSortChange?.("status")}>
                Status
                {onSortChange && <SortIndicator active={sortBy === "status"} dir={sortDir} />}
              </th>
              <th style={thStyle}>Created</th>
              {onCancel && <th style={thStyle}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const isExpanded = expandedGroups.has(group.productId);
              return (
                <GroupRows
                  key={group.productId}
                  group={group}
                  isExpanded={isExpanded}
                  onToggle={() => toggleGroup(group.productId)}
                  onCancel={onCancel}
                  isLoading={isLoading}
                  colCount={colCount}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Flat view (default) ──
  return (
    <div style={wrapperStyle}>
      <table style={tableStyle}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e2e5ea" }}>
            <th style={onSortChange ? sortableThStyle : thStyle} onClick={() => onSortChange?.("date")}>
              Product
              {onSortChange && <SortIndicator active={sortBy === "date"} dir={sortDir} />}
            </th>
            <th style={thStyle}>Size</th>
            <th style={thStyle}>Barcode</th>
            <th style={onSortChange ? sortableThStyle : thStyle} onClick={() => onSortChange?.("price")}>
              Price
              {onSortChange && <SortIndicator active={sortBy === "price"} dir={sortDir} />}
            </th>
            <th style={thStyle}>Consignor</th>
            <th style={onSortChange ? sortableThStyle : thStyle} onClick={() => onSortChange?.("status")}>
              Status
              {onSortChange && <SortIndicator active={sortBy === "status"} dir={sortDir} />}
            </th>
            <th style={thStyle}>Created</th>
            {onCancel && <th style={thStyle}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => (
            <FlatRow key={l.id} listing={l} onCancel={onCancel} isLoading={isLoading} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sub-components ──

function FlatRow({ listing: l, onCancel, isLoading }: { listing: Listing; onCancel?: (id: string) => void; isLoading?: boolean }) {
  return (
    <tr
      style={flatRowStyle}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <td style={tdStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {l.variant.product.imageUrl ? (
            <img
              src={l.variant.product.imageUrl}
              alt={l.variant.product.title}
              style={{
                width: "36px",
                height: "36px",
                objectFit: "cover",
                borderRadius: "4px",
                border: "1px solid #e3e3e3",
                flexShrink: 0,
              }}
            />
          ) : (
            <span style={{
              width: "36px",
              height: "36px",
              borderRadius: "4px",
              background: "#f0f0f2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <Package size={16} color="#9ca3af" />
            </span>
          )}
          <div>
            <div style={{ fontWeight: 500 }}>{l.variant.product.title}</div>
            <div style={{ fontSize: "11px", color: "#6d7175", marginTop: "1px" }}>
              {l.variant.product.styleId ?? l.variant.product.brand ?? ""}
            </div>
          </div>
        </div>
      </td>
      <td style={tdStyle}>{l.variant.size}</td>
      <td style={{ ...tdStyle, fontSize: "11px", fontFamily: "monospace", color: "#6d7175" }}>
        {l.variant.gtin || "—"}
      </td>
      <td style={{ ...tdStyle, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        ${Number(l.price).toFixed(2)}
      </td>
      <td style={tdStyle}>
        <div>{l.consignor.name}</div>
        <div style={{ fontSize: "11px", color: "#6d7175", marginTop: "1px" }}>{l.consignor.email}</div>
      </td>
      <td style={tdStyle}>
        <span style={statusBadge(l.status)}>{statusLabel(l.status)}</span>
      </td>
      <td style={{ ...tdStyle, fontSize: "12px", color: "#6d7175" }}>
        {relativeTime(l.createdAt)}
      </td>
      {onCancel && (
        <td style={tdStyle}>
          {l.status === "active" ? (
            <s-button
              tone="critical"
              variant="tertiary"
              onClick={() => onCancel(l.id)}
              {...(isLoading ? { disabled: true } : {})}
            >
              Cancel
            </s-button>
          ) : (
            <span style={{ color: "#d1d5db" }}>—</span>
          )}
        </td>
      )}
    </tr>
  );
}

function GroupRows({
  group,
  isExpanded,
  onToggle,
  onCancel,
  isLoading,
  colCount,
}: {
  group: ProductGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onCancel?: (id: string) => void;
  isLoading?: boolean;
  colCount: number;
}) {
  return (
    <>
      {/* Product header row */}
      <tr
        style={{
          ...groupHeaderStyle,
          ...(isExpanded ? { borderBottom: "1px solid #d1d5db", background: "#fafafa" } : {}),
        }}
        onClick={onToggle}
        onMouseEnter={(e) => (e.currentTarget.style.background = isExpanded ? "#f5f5f5" : "#f9fafb")}
        onMouseLeave={(e) => (e.currentTarget.style.background = isExpanded ? "#fafafa" : "#ffffff")}
      >
        <td colSpan={colCount} style={groupHeaderCellStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                ...chevronWrapStyle,
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                background: isExpanded ? "#e8eaed" : "transparent",
              }}
            >
              <ChevronRight size={14} strokeWidth={2.5} />
            </span>

            {group.imageUrl ? (
              <img
                src={group.imageUrl}
                alt={group.title}
                style={{
                  width: "48px",
                  height: "48px",
                  objectFit: "cover",
                  borderRadius: "6px",
                  border: "1px solid #e3e3e3",
                  flexShrink: 0,
                }}
              />
            ) : (
              <span style={{
                width: "48px",
                height: "48px",
                borderRadius: "6px",
                background: "#f0f0f2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <Package size={20} color="#9ca3af" />
              </span>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontWeight: 600, fontSize: "13.5px", color: "#1a1a1a" }}>
                {group.title}
              </span>
              <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                {group.styleId && <><strong style={{ fontWeight: 500 }}>Style:</strong> {group.styleId}</>}
                {group.brand && ` / ${group.brand}`}
                {" · "}Qty: {group.listings.length}
              </span>
            </div>

            <div style={{ marginLeft: "auto" }}>
              <span style={qtyBadgeStyle}>
                {group.listings.length}
              </span>
            </div>
          </div>
        </td>
      </tr>

      {/* Child listing rows */}
      {isExpanded && group.listings.map((l, i) => (
        <tr
          key={l.id}
          style={{
            ...childRowStyle,
            ...(i === group.listings.length - 1 ? { borderBottom: "2px solid #e2e5ea" } : {}),
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f7f8")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fcfcfd")}
        >
          <td style={childIndentTd}>
            <span style={{ fontWeight: 500 }}>{l.variant.size}</span>
          </td>
          <td style={{ ...tdStyle, fontSize: "11px", fontFamily: "monospace", color: "#6d7175" }}>
            {l.variant.gtin || "—"}
          </td>
          <td style={{ ...tdStyle, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            ${Number(l.price).toFixed(2)}
          </td>
          <td style={tdStyle}>
            <div>{l.consignor.name}</div>
            <div style={{ fontSize: "11px", color: "#6d7175", marginTop: "1px" }}>{l.consignor.email}</div>
          </td>
          <td style={tdStyle}>
            <span style={statusBadge(l.status)}>{statusLabel(l.status)}</span>
          </td>
          <td style={{ ...tdStyle, fontSize: "12px", color: "#6d7175" }}>
            {relativeTime(l.createdAt)}
          </td>
          {onCancel && (
            <td style={tdStyle}>
              {l.status === "active" ? (
                <s-button
                  tone="critical"
                  variant="tertiary"
                  onClick={() => onCancel(l.id)}
                  {...(isLoading ? { disabled: true } : {})}
                >
                  Cancel
                </s-button>
              ) : (
                <span style={{ color: "#d1d5db" }}>—</span>
              )}
            </td>
          )}
        </tr>
      ))}
    </>
  );
}
