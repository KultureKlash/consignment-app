import { useState } from "react";
import { Package } from "lucide-react";
import { thStyle, tdStyle, statusBadge, relativeTime, statusLabel } from "~/lib/admin/listing-ui";
import { fmt } from "~/lib/currency";
import type { Listing, ProductGroup, Props } from "./types";
import {
  sortableThStyle,
  tableStyle,
  flatRowStyle,
  checkboxStyle,
  checkboxThStyle,
  checkboxTdStyle,
  groupByProduct,
  SortIndicator,
} from "./helpers";
import { GroupRows } from "./GroupRows";
import { RejectModal } from "./RejectModal";
import { EditListingModal } from "./EditListingModal";
import { EditProductModal } from "./EditProductModal";

export default function ListingsTable({
  listings,
  grouped,
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
  isNavigating,
  sortBy,
  sortDir = "desc",
  onSortChange,
  selectedIds,
  onSelectionChange,
  sections,
  onSectionChange,
}: Props) {
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editModal, setEditModal] = useState<Listing | null>(null);
  const [editProductModal, setEditProductModal] = useState<ProductGroup | null>(null);
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
                    onRestore={onRestore}
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
                    sections={sections}
                    onSectionChange={onSectionChange}
                    onEditProduct={onEditProduct ? (g: ProductGroup) => setEditProductModal(g) : undefined}
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
        {editProductModal && onEditProduct && (
          <EditProductModal
            group={editProductModal}
            onConfirm={(fields) => {
              onEditProduct(editProductModal.productId, fields);
              setEditProductModal(null);
            }}
            onCancel={() => setEditProductModal(null)}
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

// ── FlatRow sub-component ──

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
        {l.variant.gtin || "\u2014"}
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
            <span style={{ color: "#d1d5db" }}>{"\u2014"}</span>
          )}
        </td>
      )}
    </tr>
  );
}
