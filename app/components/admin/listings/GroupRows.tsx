import { useState, useCallback } from "react";
import { Package, ChevronRight, Plus, Check, X, Zap, Pencil } from "lucide-react";
import { tdStyle, statusBadge, relativeTime, statusLabel } from "~/lib/admin/listing-ui";
import { fmt } from "~/lib/currency";
import type { Listing, ProductGroup, SectionOption, SortKey } from "./types";
import {
  groupHeaderStyle,
  groupHeaderCellStyle,
  chevronWrapStyle,
  qtyBadgeStyle,
  childRowStyle,
  childIndentTd,
  childHeaderStyle,
  childThStyle,
  childSortableThStyle,
  priceCellStyle,
  consignorNameStyle,
  consignorEmailStyle,
  dateCellStyle,
  checkboxStyle,
  checkboxTdStyle,
  SortIndicator,
  StatusCounts,
  ActionBtn,
} from "./helpers";
import { SectionPicker } from "./SectionPicker";

export function GroupRows({
  group,
  isExpanded,
  onToggle,
  onCancel,
  onRestore,
  onApprove,
  onReject,
  onActivate,
  onApproveWithdrawal,
  onCompleteWithdrawal,
  onEditApprove,
  onAdminEdit,
  onEditProduct,
  onQuickAdd,
  isLoading,
  colCount,
  hasSelection,
  selectedIds,
  onToggleId,
  onToggleGroup,
  sections,
  onSectionChange,
}: {
  group: ProductGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onCancel?: (id: string) => void;
  onRestore?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onActivate?: (id: string) => void;
  onApproveWithdrawal?: (id: string) => void;
  onCompleteWithdrawal?: (id: string) => void;
  onEditApprove?: (listing: Listing) => void;
  onAdminEdit?: (listing: Listing) => void;
  onEditProduct?: (group: ProductGroup) => void;
  onQuickAdd?: (productId: string, anchorEl: HTMLElement) => void;
  isLoading?: boolean;
  colCount: number;
  hasSelection: boolean;
  selectedIds?: Set<string>;
  onToggleId: (id: string) => void;
  onToggleGroup: (ids: string[]) => void;
  sections?: SectionOption[];
  onSectionChange?: (productId: string, sectionId: string | null) => void;
}) {
  const [localSortKey, setLocalSortKey] = useState<SortKey | null>(null);
  const [localSortDir, setLocalSortDir] = useState<"asc" | "desc">("asc");
  const [localSectionId, setLocalSectionId] = useState<string>(group.sectionId ?? "");

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
                {/* Edit product button */}
                {onEditProduct && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditProduct(group); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "#c4c9d1", transition: "color 0.15s", flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#6d7175"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "#c4c9d1"; }}
                    title="Edit product"
                  >
                    <Pencil size={13} />
                  </button>
                )}
                {/* Section badge — click to open picker */}
                {sections && sections.length > 0 && (
                  <SectionPicker
                    sections={sections}
                    value={localSectionId}
                    onChange={(id) => {
                      setLocalSectionId(id);
                      onSectionChange?.(group.productId, id || null);
                    }}
                  />
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
              {l.variant.gtin || "\u2014"}
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
                  {l.status === "cancelled" && onRestore && (
                    <ActionBtn
                      label="Restore"
                      icon={<Zap size={13} />}
                      color="#059669"
                      bg="#ecfdf5"
                      border="#a7f3d0"
                      onClick={() => onRestore(l.id)}
                      disabled={isLoading}
                    />
                  )}
                  {!["submitted", "approved_awaiting_dropoff", "active", "withdrawal_requested", "pending_pickup", "cancelled"].includes(l.status) && (
                    <span style={{ color: "#d1d5db" }}>{"\u2014"}</span>
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
