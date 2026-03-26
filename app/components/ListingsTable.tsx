import { useState, useCallback } from "react";
import { Package, ChevronRight, Plus, Check, X, Zap, Pencil, Camera } from "lucide-react";
import { processProductImage } from "~/lib/image-processing";
import { thStyle, tdStyle, statusBadge, relativeTime, statusLabel } from "~/lib/listing-ui";
import { compareSizes } from "~/lib/size-order";
import { fmt } from "~/lib/currency";

type Listing = {
  id: string;
  price: number | { toFixed: (digits: number) => string };
  cost?: number | null;
  status: string;
  createdAt: string | Date;
  consignor: { name: string; email: string; storeOwned?: boolean };
  variant: {
    size: string;
    gtin: string | null;
    product: { id: string; title: string; styleId: string | null; brand: string | null; category?: string | null; imageUrl?: string | null };
  };
};

export type EditApproveFields = {
  title: string;
  brand: string;
  category: string;
  styleId: string;
  size: string;
  gtin: string;
  price: string;
  cost?: string;
  imageData?: string;
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
  onApprove?: (listingId: string) => void;
  onReject?: (listingId: string, reason: string) => void;
  onActivate?: (listingId: string) => void;
  onApproveWithdrawal?: (listingId: string) => void;
  onCompleteWithdrawal?: (listingId: string) => void;
  onEditApprove?: (listingId: string, fields: EditApproveFields) => void;
  onAdminEdit?: (listingId: string, fields: EditApproveFields) => void;
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
  borderBottom: "1px solid #f0f1f3",
  background: "#ffffff",
  transition: "background 0.15s ease-out",
};

const childIndentTd: React.CSSProperties = {
  ...tdStyle,
  paddingLeft: "42px",
};

const childHeaderStyle: React.CSSProperties = {
  borderBottom: "1px solid #e8eaed",
  background: "#ffffff",
};

const childThStyle: React.CSSProperties = {
  padding: "7px 8px",
  fontSize: "10px",
  fontWeight: 700,
  color: "#8c9196",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  textAlign: "left" as const,
};

const childSortableThStyle: React.CSSProperties = {
  ...childThStyle,
  cursor: "pointer",
  userSelect: "none",
};

const sizeBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "32px",
  padding: "2px 8px",
  fontSize: "12px",
  fontWeight: 600,
  borderRadius: "5px",
  background: "#eef0f3",
  color: "#374151",
  letterSpacing: "0.01em",
};

const priceCellStyle: React.CSSProperties = {
  ...tdStyle,
  fontWeight: 700,
  fontSize: "13.5px",
  fontVariantNumeric: "tabular-nums",
  color: "#111827",
};

const consignorNameStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  color: "#1a1a1a",
  lineHeight: 1.3,
};

const consignorEmailStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#9ca3af",
  marginTop: "1px",
  lineHeight: 1.3,
};

const dateCellStyle: React.CSSProperties = {
  ...tdStyle,
  fontSize: "12px",
  color: "#9ca3af",
  fontVariantNumeric: "tabular-nums",
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

const statusCountColors: Record<string, { bg: string; color: string }> = {
  submitted: { bg: "#fef3c7", color: "#92400e" },
  approved: { bg: "#dbeafe", color: "#1e40af" },
  active: { bg: "#d1fae5", color: "#065f46" },
  sold: { bg: "#f3e8ff", color: "#6b21a8" },
};

function StatusCounts({ listings }: { listings: Listing[] }) {
  const submitted = listings.filter((l) => l.status === "submitted").length;
  const approved = listings.filter((l) => l.status === "approved_awaiting_dropoff").length;
  const active = listings.filter((l) => l.status === "active").length;
  const sold = listings.filter((l) => l.status === "sold").length;
  const counts = [
    { label: "submitted", count: submitted },
    { label: "approved", count: approved },
    { label: "active", count: active },
    { label: "sold", count: sold },
  ].filter((c) => c.count > 0);

  if (counts.length === 0) {
    return (
      <span style={{ fontSize: "11px", color: "#9ca3af" }}>
        {listings.length} listing{listings.length !== 1 ? "s" : ""}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
      {counts.map((c) => {
        const colors = statusCountColors[c.label] ?? { bg: "#f3f4f6", color: "#6b7280" };
        return (
          <span
            key={c.label}
            style={{
              display: "inline-block",
              padding: "1px 7px",
              fontSize: "11px",
              fontWeight: 600,
              borderRadius: "4px",
              background: colors.bg,
              color: colors.color,
              lineHeight: "18px",
              letterSpacing: "0.01em",
            }}
          >
            {c.count} {c.label}
          </span>
        );
      })}
    </div>
  );
}

// ── Component ──

export default function ListingsTable({
  listings,
  grouped,
  onCancel,
  onApprove,
  onReject,
  onActivate,
  onApproveWithdrawal,
  onCompleteWithdrawal,
  onEditApprove,
  onAdminEdit,
  onQuickAdd,
  isLoading,
  isNavigating,
  sortBy,
  sortDir = "desc",
  onSortChange,
  selectedIds,
  onSelectionChange,
}: Props) {
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editModal, setEditModal] = useState<Listing | null>(null);
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

  const selectableStatuses = ["submitted", "approved_awaiting_dropoff", "active"];
  const selectableListings = listings.filter((l) => selectableStatuses.includes(l.status));
  const allSelectableSelected = selectableListings.length > 0 && selectableListings.every((l) => selectedIds?.has(l.id));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelectableSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(selectableListings.map((l) => l.id)));
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

  const handleRejectConfirm = () => {
    if (rejectModal && rejectReason.trim() && onReject) {
      onReject(rejectModal, rejectReason.trim());
      setRejectModal(null);
      setRejectReason("");
    }
  };

  // ── Grouped view ──
  if (grouped) {
    const groups = groupByProduct(listings);

    return (
      <>
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
                    onApprove={onApprove}
                    onReject={onReject ? (id: string) => { setRejectModal(id); setRejectReason(""); } : undefined}
                    onActivate={onActivate}
                    onApproveWithdrawal={onApproveWithdrawal}
                    onCompleteWithdrawal={onCompleteWithdrawal}
                    onEditApprove={onEditApprove ? (listing: Listing) => setEditModal(listing) : undefined}
                    onAdminEdit={onAdminEdit ? (listing: Listing) => setEditModal(listing) : undefined}
                    onQuickAdd={onQuickAdd}
                    isLoading={isLoading}
                    colCount={colCount}
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
        {rejectModal && <RejectModal onConfirm={handleRejectConfirm} onCancel={() => setRejectModal(null)} reason={rejectReason} setReason={setRejectReason} />}
        {editModal && (onEditApprove || onAdminEdit) && (
          <EditListingModal
            listing={editModal}
            mode={editModal.status === "submitted" && onEditApprove ? "edit-approve" : "edit"}
            onConfirm={(fields) => {
              if (editModal.status === "submitted" && onEditApprove) {
                onEditApprove(editModal.id, fields);
              } else if (onAdminEdit) {
                onAdminEdit(editModal.id, fields);
              }
              setEditModal(null);
            }}
            onCancel={() => setEditModal(null)}
          />
        )}
      </>
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
                  checked={allSelectableSelected}
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
  const isSelectable = ["submitted", "approved_awaiting_dropoff", "active"].includes(l.status);
  return (
    <tr
      style={flatRowStyle}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {hasSelection && (
        <td style={checkboxTdStyle}>
          {isSelectable ? (
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
        ${fmt(Number(l.price))}
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
  onApprove,
  onReject,
  onActivate,
  onApproveWithdrawal,
  onCompleteWithdrawal,
  onEditApprove,
  onAdminEdit,
  onQuickAdd,
  isLoading,
  colCount,
  hasSelection,
  selectedIds,
  onToggleId,
  onToggleGroup,
}: {
  group: ProductGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onCancel?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onActivate?: (id: string) => void;
  onApproveWithdrawal?: (id: string) => void;
  onCompleteWithdrawal?: (id: string) => void;
  onEditApprove?: (listing: Listing) => void;
  onAdminEdit?: (listing: Listing) => void;
  onQuickAdd?: (productId: string, anchorEl: HTMLElement) => void;
  isLoading?: boolean;
  colCount: number;
  hasSelection: boolean;
  selectedIds?: Set<string>;
  onToggleId: (id: string) => void;
  onToggleGroup: (ids: string[]) => void;
}) {
  const [localSortKey, setLocalSortKey] = useState<SortKey | null>(null);
  const [localSortDir, setLocalSortDir] = useState<"asc" | "desc">("asc");

  const handleLocalSort = (key: SortKey) => {
    if (localSortKey === key) {
      setLocalSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setLocalSortKey(key);
      setLocalSortDir("asc");
    }
  };

  const sortedListings = localSortKey
    ? [...group.listings].sort((a, b) => {
        let cmp = 0;
        if (localSortKey === "price") cmp = Number(a.price) - Number(b.price);
        else if (localSortKey === "status") cmp = a.status.localeCompare(b.status);
        else if (localSortKey === "date") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return localSortDir === "asc" ? cmp : -cmp;
      })
    : group.listings;

  const groupSelectableIds = group.listings.filter((l) => ["submitted", "approved_awaiting_dropoff", "active"].includes(l.status)).map((l) => l.id);
  const allGroupSelected = hasSelection && groupSelectableIds.length > 0 && groupSelectableIds.every((id) => selectedIds?.has(id));

  const scrollRef = useCallback((node: HTMLTableRowElement | null) => {
    if (node) {
      setTimeout(() => node.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  }, []);

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

            <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontWeight: 600, fontSize: "13.5px", color: "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {group.title}
                </span>
                {group.brand && (
                  <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {group.brand}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {group.styleId && (
                  <span style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "monospace", letterSpacing: "0.02em" }}>
                    {group.styleId}
                  </span>
                )}
                <StatusCounts listings={group.listings} />
              </div>
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
        <tr ref={scrollRef} style={childHeaderStyle}>
          {hasSelection && (
            <td style={{ ...childThStyle, width: "36px", paddingRight: "0" }} onClick={(e) => e.stopPropagation()}>
              {groupSelectableIds.length > 0 && (
                <input
                  type="checkbox"
                  checked={allGroupSelected}
                  onChange={() => onToggleGroup(groupSelectableIds)}
                  style={checkboxStyle}
                />
              )}
            </td>
          )}
          <td style={{ ...childThStyle, paddingLeft: "42px" }}>Size</td>
          <td style={childThStyle}>Barcode</td>
          <td style={childSortableThStyle} onClick={() => handleLocalSort("price")}>
            Price
            <SortIndicator active={localSortKey === "price"} dir={localSortDir} />
          </td>
          <td style={childThStyle}>Consignor</td>
          <td style={childSortableThStyle} onClick={() => handleLocalSort("status")}>
            Status
            <SortIndicator active={localSortKey === "status"} dir={localSortDir} />
          </td>
          <td style={childSortableThStyle} onClick={() => handleLocalSort("date")}>
            Created
            <SortIndicator active={localSortKey === "date"} dir={localSortDir} />
          </td>
          {(onCancel || onApprove) && <td style={childThStyle}>Actions</td>}
        </tr>
      )}

      {/* Child listing rows */}
      {isExpanded && sortedListings.map((l, i) => {
        const isSelectable = ["submitted", "approved_awaiting_dropoff", "active"].includes(l.status);
        return (
          <tr
            key={l.id}
            style={{
              ...childRowStyle,
              ...(i === sortedListings.length - 1 ? { borderBottom: "2px solid #e2e5ea" } : {}),
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
          >
            {hasSelection && (
              <td style={checkboxTdStyle} onClick={(e) => e.stopPropagation()}>
                {isSelectable ? (
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
              <span style={{ fontWeight: 600 }}>{l.variant.size}</span>
            </td>
            <td style={{ ...tdStyle, fontSize: "11px", fontFamily: "monospace", color: "#9ca3af", letterSpacing: "0.02em" }}>
              {l.variant.gtin || "—"}
            </td>
            <td style={priceCellStyle}>
              ${fmt(Number(l.price))}
            </td>
            <td style={tdStyle}>
              <div style={consignorNameStyle}>{l.consignor.name}</div>
              <div style={consignorEmailStyle}>{l.consignor.email}</div>
            </td>
            <td style={tdStyle}>
              <span style={statusBadge(l.status)}>{statusLabel(l.status)}</span>
            </td>
            <td style={dateCellStyle}>
              {relativeTime(l.createdAt)}
            </td>
            {(onCancel || onApprove) && (
              <td style={tdStyle}>
                <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                  {l.status === "submitted" && onApprove && (
                    <>
                      <ActionBtn
                        label="Approve"
                        icon={<Check size={13} />}
                        color="#0d9488"
                        bg="#f0fdfa"
                        border="#99f0e4"
                        onClick={() => onApprove(l.id)}
                        disabled={isLoading}
                      />
                      {onEditApprove && (
                        <ActionBtn
                          label="Edit"
                          icon={<Pencil size={13} />}
                          color="#7c3aed"
                          bg="#f5f3ff"
                          border="#c4b5fd"
                          onClick={() => onEditApprove(l)}
                          disabled={isLoading}
                        />
                      )}
                      {onReject && (
                        <ActionBtn
                          label="Reject"
                          icon={<X size={13} />}
                          color="#dc2626"
                          bg="#fef2f2"
                          border="#fecaca"
                          onClick={() => onReject(l.id)}
                          disabled={isLoading}
                        />
                      )}
                    </>
                  )}
                  {l.status === "approved_awaiting_dropoff" && onActivate && (
                    <ActionBtn
                      label="Activate"
                      icon={<Zap size={13} />}
                      color="#2c6ecb"
                      bg="#eff6ff"
                      border="#bfdbfe"
                      onClick={() => onActivate(l.id)}
                      disabled={isLoading}
                    />
                  )}
                  {onAdminEdit && !["submitted", "sold", "cancelled", "rejected", "withdrawn"].includes(l.status) && (
                    <ActionBtn
                      label="Edit"
                      icon={<Pencil size={13} />}
                      color="#7c3aed"
                      bg="#f5f3ff"
                      border="#c4b5fd"
                      onClick={() => onAdminEdit(l)}
                      disabled={isLoading}
                    />
                  )}
                  {l.status === "active" && onCancel && (
                    <ActionBtn
                      label="Cancel"
                      icon={<X size={13} />}
                      color="#6d7175"
                      bg="#f6f6f7"
                      border="#e3e3e3"
                      onClick={() => onCancel(l.id)}
                      disabled={isLoading}
                    />
                  )}
                  {l.status === "withdrawal_requested" && onApproveWithdrawal && (
                    <ActionBtn
                      label="Approve Withdrawal"
                      icon={<Check size={13} />}
                      color="#ea580c"
                      bg="#fff7ed"
                      border="#fed7aa"
                      onClick={() => onApproveWithdrawal(l.id)}
                      disabled={isLoading}
                    />
                  )}
                  {l.status === "pending_pickup" && onCompleteWithdrawal && (
                    <ActionBtn
                      label="Picked Up"
                      icon={<Check size={13} />}
                      color="#0891b2"
                      bg="#ecfeff"
                      border="#a5f3fc"
                      onClick={() => onCompleteWithdrawal(l.id)}
                      disabled={isLoading}
                    />
                  )}
                  {!["submitted", "approved_awaiting_dropoff", "active", "withdrawal_requested", "pending_pickup"].includes(l.status) && (
                    <span style={{ color: "#d1d5db" }}>—</span>
                  )}
                </div>
              </td>
            )}
          </tr>
        );
      })}
    </>
  );
}

// ── Shared action button ──

function ActionBtn({ label, icon, color, bg, border, onClick, disabled }: {
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px 10px",
        fontSize: "11px",
        fontWeight: 600,
        borderRadius: "6px",
        border: `1px solid ${border}`,
        background: bg,
        color,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s ease",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.opacity = "0.8"; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.opacity = "1"; } }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Reject modal ──

function RejectModal({ onConfirm, onCancel, reason, setReason }: {
  onConfirm: () => void;
  onCancel: () => void;
  reason: string;
  setReason: (r: string) => void;
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "420px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <h3 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 4px" }}>Reject Listing</h3>
        <p style={{ fontSize: "13px", color: "#6d7175", margin: "0 0 16px" }}>
          Provide a reason for rejection. The consignor will see this.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Item condition doesn't meet our standards..."
          style={{
            width: "100%",
            minHeight: "80px",
            padding: "10px 12px",
            fontSize: "13px",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            fontFamily: "inherit",
            resize: "vertical",
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#111827"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(17,24,39,0.08)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }}
          autoFocus
        />
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 500,
              borderRadius: "8px",
              border: "1px solid #e3e3e3",
              background: "#fff",
              color: "#6d7175",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!reason.trim()}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "8px",
              border: "none",
              background: !reason.trim() ? "#fca5a5" : "#dc2626",
              color: "#fff",
              cursor: !reason.trim() ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "background 0.15s",
            }}
          >
            Reject Listing
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit & Approve modal ──

const editInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: "13px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box" as const,
  transition: "border-color 0.15s, box-shadow 0.15s",
};

const editLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 600,
  color: "#6d7175",
  marginBottom: "4px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.03em",
};

function EditListingModal({ listing, mode, onConfirm, onCancel }: {
  listing: Listing;
  mode: "edit-approve" | "edit";
  onConfirm: (fields: EditApproveFields) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(listing.variant.product.title);
  const [brand, setBrand] = useState(listing.variant.product.brand ?? "");
  const [category, setCategory] = useState(listing.variant.product.category ?? "");
  const [styleId, setStyleId] = useState(listing.variant.product.styleId ?? "");
  const [size, setSize] = useState(listing.variant.size);
  const [gtin, setGtin] = useState(listing.variant.gtin ?? "");
  const [price, setPrice] = useState(String(fmt(Number(listing.price))));
  const [cost, setCost] = useState(listing.cost != null ? String(listing.cost) : "");
  const [imageData, setImageData] = useState("");
  const currentImageUrl = listing.variant.product.imageUrl ?? null;
  const isStoreOwned = listing.consignor.storeOwned ?? false;

  const canSubmit = title.trim() && size.trim() && Number(price) > 0;

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#7c3aed";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)";
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#d1d5db";
    e.currentTarget.style.boxShadow = "none";
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("Image must be under 10MB"); return; }
    try {
      const processed = await processProductImage(file);
      setImageData(processed);
    } catch {
      alert("Failed to process image");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "480px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <Pencil size={16} color="#7c3aed" />
          <h3 style={{ fontSize: "15px", fontWeight: 600, margin: 0 }}>
            {mode === "edit-approve" ? "Edit & Approve" : "Edit Listing"}
          </h3>
        </div>
        <p style={{ fontSize: "13px", color: "#6d7175", margin: "0 0 16px" }}>
          {mode === "edit-approve"
            ? "Fix any mistakes, then approve the listing in one step."
            : "Edit listing details."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Product Image */}
          <div>
            <label style={editLabelStyle}>Product Image</label>
            {imageData ? (
              <div style={{ position: "relative", width: "96px", height: "96px" }}>
                <img src={imageData} alt="Product" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px", border: "1px solid #e3e3e3" }} />
                <button
                  type="button"
                  onClick={() => setImageData("")}
                  style={{
                    position: "absolute", top: "4px", right: "4px",
                    width: "20px", height: "20px", borderRadius: "50%",
                    background: "rgba(0,0,0,0.6)", color: "#fff",
                    border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: 0,
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ) : currentImageUrl && !currentImageUrl.startsWith("data:") ? (
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <img src={currentImageUrl} alt="Current" style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e3e3e3" }} />
                <label style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 12px", borderRadius: "8px",
                  border: "1px solid #d1d5db", background: "#fff",
                  fontSize: "12px", fontWeight: 500, color: "#6d7175",
                  cursor: "pointer",
                }}>
                  <Camera size={14} />
                  Replace
                  <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
                </label>
              </div>
            ) : (
              <label style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "8px 12px", borderRadius: "8px",
                border: "1px dashed #d1d5db", background: "#f9fafb",
                fontSize: "13px", color: "#6d7175",
                cursor: "pointer",
              }}>
                <Camera size={14} />
                Upload photo
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
              </label>
            )}
          </div>

          <div>
            <label style={editLabelStyle}>Product Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={editInputStyle}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={editLabelStyle}>Brand</label>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                style={editInputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>
            <div>
              <label style={editLabelStyle}>Category</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={editInputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>
          </div>

          <div>
            <label style={editLabelStyle}>Style ID</label>
            <input
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
              style={editInputStyle}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Optional"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={editLabelStyle}>Size</label>
              <input
                value={size}
                onChange={(e) => setSize(e.target.value)}
                style={editInputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>
            <div>
              <label style={editLabelStyle}>GTIN / Barcode</label>
              <input
                value={gtin}
                onChange={(e) => setGtin(e.target.value)}
                style={{ ...editInputStyle, fontFamily: "monospace" }}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="Optional"
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isStoreOwned ? "1fr 1fr" : "1fr", gap: "12px" }}>
            <div>
              <label style={editLabelStyle}>Price ($)</label>
              <input
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={editInputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>
            {isStoreOwned && (
              <div>
                <label style={editLabelStyle}>Cost ($)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  style={editInputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  placeholder="0.00"
                />
              </div>
            )}
          </div>
        </div>

        {/* Consignor info (read-only) */}
        <div style={{ marginTop: "12px", padding: "8px 12px", borderRadius: "8px", background: "#f9fafb", fontSize: "12px", color: "#6d7175" }}>
          {listing.consignor.name} ({listing.consignor.email})
          {isStoreOwned && <span style={{ marginLeft: "6px", padding: "1px 6px", borderRadius: "4px", background: "#dbeafe", color: "#1e40af", fontWeight: 600, fontSize: "10px" }}>Store</span>}
        </div>

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 500,
              borderRadius: "8px",
              border: "1px solid #e3e3e3",
              background: "#fff",
              color: "#6d7175",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({
              title: title.trim(), brand: brand.trim(), category: category.trim(), styleId: styleId.trim(),
              size: size.trim(), gtin: gtin.trim(), price,
              ...(isStoreOwned ? { cost: cost.trim() } : {}),
              ...(imageData ? { imageData } : {}),
            })}
            disabled={!canSubmit}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "8px",
              border: "none",
              background: !canSubmit ? "#c4b5fd" : "#7c3aed",
              color: "#fff",
              cursor: !canSubmit ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { if (canSubmit) e.currentTarget.style.background = "#6d28d9"; }}
            onMouseLeave={(e) => { if (canSubmit) e.currentTarget.style.background = "#7c3aed"; }}
          >
            {mode === "edit-approve" ? "Save & Approve" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
