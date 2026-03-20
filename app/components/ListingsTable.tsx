import { useState } from "react";
import { Package, ChevronRight, Plus } from "lucide-react";
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
    product: { id: string; title: string; styleId: string | null; brand: string | null; category?: string | null; imageUrl?: string | null };
  };
};

type SortKey = "date" | "price" | "status";

type VariantInfo = {
  size: string;
  gtin: string | null;
};

type ProductGroup = {
  productId: string;
  title: string;
  styleId: string | null;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  variants: VariantInfo[];
  listings: Listing[];
};

type Props = {
  listings: Listing[];
  grouped?: boolean;
  onCancel?: (listingId: string) => void;
  onQuickAdd?: (productId: string, anchorEl: HTMLElement) => void;
  isLoading?: boolean;
  isNavigating?: boolean;
  sortBy?: SortKey;
  sortDir?: "asc" | "desc";
  onSortChange?: (sortBy: SortKey) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
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

const checkboxStyle: React.CSSProperties = {
  width: "16px",
  height: "16px",
  cursor: "pointer",
  accentColor: "#111827",
};

const checkboxThStyle: React.CSSProperties = {
  ...thStyle,
  width: "36px",
  paddingRight: "0",
};

const checkboxTdStyle: React.CSSProperties = {
  ...tdStyle,
  width: "36px",
  paddingRight: "0",
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
        category: l.variant.product.category ?? null,
        imageUrl: l.variant.product.imageUrl ?? null,
        variants: [],
        listings: [],
      };
      map.set(pid, group);
    }
    group.listings.push(l);
  }
  // Sort child listings by size and deduplicate variants
  for (const group of map.values()) {
    group.listings.sort((a, b) => compareSizes(a.variant.size, b.variant.size));
    const variantMap = new Map<string, VariantInfo>();
    for (const l of group.listings) {
      if (!variantMap.has(l.variant.size)) {
        variantMap.set(l.variant.size, { size: l.variant.size, gtin: l.variant.gtin });
      }
    }
    group.variants = Array.from(variantMap.values());
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
  onQuickAdd,
  isLoading,
  isNavigating,
  sortBy,
  sortDir = "desc",
  onSortChange,
  selectedIds,
  onSelectionChange,
}: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const hasSelection = !!selectedIds && !!onSelectionChange;

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

  const colCount = (onCancel ? 7 : 6) + (hasSelection ? 1 : 0);

  const toggleId = (id: string) => {
    if (!selectedIds || !onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const activeListings = listings.filter((l) => l.status === "active");
  const allActiveSelected = activeListings.length > 0 && activeListings.every((l) => selectedIds?.has(l.id));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allActiveSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(activeListings.map((l) => l.id)));
    }
  };

  const toggleGroupSelection = (ids: string[]) => {
    if (!selectedIds || !onSelectionChange) return;
    const allSelected = ids.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      for (const id of ids) next.delete(id);
    } else {
      for (const id of ids) next.add(id);
    }
    onSelectionChange(next);
  };

  // ── Grouped view ──
  if (grouped) {
    const groups = groupByProduct(listings);

    return (
      <div style={wrapperStyle}>
        <table style={tableStyle}>
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
                  onQuickAdd={onQuickAdd}
                  isLoading={isLoading}
                  colCount={colCount}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSortChange={onSortChange}
                  hasSelection={hasSelection}
                  selectedIds={selectedIds}
                  onToggleId={toggleId}
                  onToggleGroup={toggleGroupSelection}
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
            {hasSelection && (
              <th style={checkboxThStyle}>
                <input
                  type="checkbox"
                  checked={allActiveSelected}
                  onChange={toggleAll}
                  style={checkboxStyle}
                />
              </th>
            )}
            <th style={thStyle}>Product</th>
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
            <th style={onSortChange ? sortableThStyle : thStyle} onClick={() => onSortChange?.("date")}>
              Created
              {onSortChange && <SortIndicator active={sortBy === "date"} dir={sortDir} />}
            </th>
            {onCancel && <th style={thStyle}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => (
            <FlatRow
              key={l.id}
              listing={l}
              onCancel={onCancel}
              isLoading={isLoading}
              hasSelection={hasSelection}
              isSelected={selectedIds?.has(l.id) ?? false}
              onToggle={() => toggleId(l.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sub-components ──

function FlatRow({
  listing: l,
  onCancel,
  isLoading,
  hasSelection,
  isSelected,
  onToggle,
}: {
  listing: Listing;
  onCancel?: (id: string) => void;
  isLoading?: boolean;
  hasSelection: boolean;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const isActive = l.status === "active";
  return (
    <tr
      style={flatRowStyle}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {hasSelection && (
        <td style={checkboxTdStyle}>
          {isActive ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggle}
              style={checkboxStyle}
            />
          ) : (
            <span style={{ display: "inline-block", width: "16px" }} />
          )}
        </td>
      )}
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
  onQuickAdd,
  isLoading,
  colCount,
  sortBy,
  sortDir = "desc",
  onSortChange,
  hasSelection,
  selectedIds,
  onToggleId,
  onToggleGroup,
}: {
  group: ProductGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onCancel?: (id: string) => void;
  onQuickAdd?: (productId: string, anchorEl: HTMLElement) => void;
  isLoading?: boolean;
  colCount: number;
  sortBy?: SortKey;
  sortDir?: "asc" | "desc";
  onSortChange?: (sortBy: SortKey) => void;
  hasSelection: boolean;
  selectedIds?: Set<string>;
  onToggleId: (id: string) => void;
  onToggleGroup: (ids: string[]) => void;
}) {
  const groupActiveIds = group.listings.filter((l) => l.status === "active").map((l) => l.id);
  const allGroupSelected = hasSelection && groupActiveIds.length > 0 && groupActiveIds.every((id) => selectedIds?.has(id));
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
                {" · "}Qty: {group.listings.filter((l) => l.status === "active").length}
              </span>
            </div>

            <div style={{ marginLeft: "auto" }} onClick={(e) => e.stopPropagation()}>
              {onQuickAdd ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAdd(group.productId, e.currentTarget as HTMLElement);
                  }}
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "8px",
                    border: "1px solid #e2e5ea",
                    background: "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6d7175",
                    transition: "all 0.15s ease",
                    padding: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f3f4f6"; e.currentTarget.style.borderColor = "#c4c9d1"; e.currentTarget.style.color = "#1a1a1a"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e5ea"; e.currentTarget.style.color = "#6d7175"; }}
                  title="Quick add listing"
                >
                  <Plus size={16} strokeWidth={2.5} />
                </button>
              ) : (
                <span style={qtyBadgeStyle}>
                  {group.listings.filter((l) => l.status === "active").length}
                </span>
              )}
            </div>
          </div>
        </td>
      </tr>

      {/* Column headers — only when expanded */}
      {isExpanded && (
        <tr style={{ borderBottom: "1px solid #e8eaed", background: "#f9fafb" }}>
          {hasSelection && (
            <td style={checkboxThStyle} onClick={(e) => e.stopPropagation()}>
              {groupActiveIds.length > 0 && (
                <input
                  type="checkbox"
                  checked={allGroupSelected}
                  onChange={() => onToggleGroup(groupActiveIds)}
                  style={checkboxStyle}
                />
              )}
            </td>
          )}
          <td style={{ ...thStyle, paddingLeft: "42px" }}>Size</td>
          <td style={thStyle}>Barcode</td>
          <td style={onSortChange ? sortableThStyle : thStyle} onClick={() => onSortChange?.("price")}>
            Price
            {onSortChange && <SortIndicator active={sortBy === "price"} dir={sortDir} />}
          </td>
          <td style={thStyle}>Consignor</td>
          <td style={onSortChange ? sortableThStyle : thStyle} onClick={() => onSortChange?.("status")}>
            Status
            {onSortChange && <SortIndicator active={sortBy === "status"} dir={sortDir} />}
          </td>
          <td style={onSortChange ? sortableThStyle : thStyle} onClick={() => onSortChange?.("date")}>
            Created
            {onSortChange && <SortIndicator active={sortBy === "date"} dir={sortDir} />}
          </td>
          {onCancel && <td style={thStyle}>Actions</td>}
        </tr>
      )}

      {/* Child listing rows */}
      {isExpanded && group.listings.map((l, i) => {
        const isActive = l.status === "active";
        return (
          <tr
            key={l.id}
            style={{
              ...childRowStyle,
              ...(i === group.listings.length - 1 ? { borderBottom: "2px solid #e2e5ea" } : {}),
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f7f8")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fcfcfd")}
          >
            {hasSelection && (
              <td style={checkboxTdStyle} onClick={(e) => e.stopPropagation()}>
                {isActive ? (
                  <input
                    type="checkbox"
                    checked={selectedIds?.has(l.id) ?? false}
                    onChange={() => onToggleId(l.id)}
                    style={checkboxStyle}
                  />
                ) : (
                  <span style={{ display: "inline-block", width: "16px" }} />
                )}
              </td>
            )}
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
        );
      })}
    </>
  );
}
