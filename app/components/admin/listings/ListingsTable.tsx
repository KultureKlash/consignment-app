import { useState } from "react";
import { Package } from "lucide-react";
import { statusBadgeClass, relativeTime, statusLabel } from "./listing-ui";
import { fmt } from "~/lib/currency";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import type { Listing, ProductGroup, Props } from "./types";
import {
  sortableThClass,
  tableClass,
  flatRowClass,
  checkboxClass,
  checkboxThClass,
  checkboxTdClass,
  groupByProduct,
  SortIndicator,
} from "./listingHelpers";
import { GroupRows } from "./GroupRows";
import { RejectModal } from "./RejectModal";
import { EditListingModal } from "./EditListingModal";
import { EditProductModal } from "./EditProductModal";
import { ListingActionsProvider } from "./ListingActionsContext";
import type { ListingActions } from "./ListingActionsContext";

export default function ListingsTable({
  listings,
  grouped,
  onCancel,
  onRestore,
  onApprove,
  onReject,
  onActivate,
  onApproveWithdrawal,
  onDenyWithdrawal,
  onCompleteWithdrawal,
  onRetrySync,
  syncingListingId,
  onEditApprove,
  onAdminEdit,
  onUpdateCost,
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
      <div className="text-center py-12 px-5">
        <Package size={44} className="text-gray-300 mb-3.5 mx-auto" />
        <p className="text-sm text-gray-500 m-0 leading-normal">
          No listings found.
        </p>
      </div>
    );
  }

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

  const selectableStatuses = [LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.ACTIVE];
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

    const actionsValue: ListingActions = {
      onCancel,
      onRestore,
      onApprove,
      onReject: onReject ? (id: string) => { setRejectModal(id); setRejectReason(""); } : undefined,
      onCheckin: onActivate,
      onApproveWithdrawal,
      onDenyWithdrawal,
      onCompleteWithdrawal,
      onRetrySync,
      syncingListingId,
      onEditApprove: onEditApprove ? (listing: Listing) => setEditModal(listing) : undefined,
      onAdminEdit: onAdminEdit ? (listing: Listing) => setEditModal(listing) : undefined,
      onQuickAdd,
      isLoading,
      selectedIds,
      onToggleId: toggleId,
      onToggleGroup: toggleGroupSelection,
      sections,
      onSectionChange,
      onEditProduct: onEditProduct ? (g: ProductGroup) => setEditProductModal(g) : undefined,
    };

    return (
      <ListingActionsProvider value={actionsValue}>
        <div className={`transition-opacity duration-150 ${isNavigating ? "opacity-50 pointer-events-none" : ""}`}>
          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className={tableClass}>
              <tbody>
                {groups.map((group) => (
                  <GroupRows
                    key={group.productId}
                    group={group}
                    isExpanded={expandedGroups.has(group.productId)}
                    onToggle={() => toggleGroup(group.productId)}
                    colCount={colCount}
                    hasSelection={hasSelection}
                    renderMode="desktop"
                  />
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile: cards — outside table element */}
          <div className="md:hidden">
            {groups.map((group) => (
              <GroupRows
                key={group.productId}
                group={group}
                isExpanded={expandedGroups.has(group.productId)}
                onToggle={() => toggleGroup(group.productId)}
                colCount={colCount}
                hasSelection={hasSelection}
                renderMode="mobile"
              />
            ))}
          </div>
        </div>
        {rejectModal && <RejectModal onConfirm={handleRejectConfirm} onCancel={() => setRejectModal(null)} reason={rejectReason} setReason={setRejectReason} />}
        {editModal && (onEditApprove || onAdminEdit) && (
          <EditListingModal
            listing={editModal}
            mode={
              editModal.status === LISTING_STATUS.SOLD ? "cost-only"
              : editModal.status === LISTING_STATUS.SUBMITTED && onEditApprove ? "edit-approve"
              : "edit"
            }
            onConfirm={(fields) => {
              if (editModal.status === LISTING_STATUS.SUBMITTED && onEditApprove) {
                onEditApprove(editModal.id, fields);
              } else if (onAdminEdit) {
                onAdminEdit(editModal.id, fields);
              }
              setEditModal(null);
            }}
            onUpdateCost={onUpdateCost ? (listingId, cost) => {
              onUpdateCost(listingId, cost);
              setEditModal(null);
            } : undefined}
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
      </ListingActionsProvider>
    );
  }

  // ── Flat view (default) ──
  return (
    <div className={`transition-opacity duration-150 ${isNavigating ? "opacity-50 pointer-events-none" : ""}`}>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr className="border-b-2 border-gray-200">
              {hasSelection && (
                <th className={checkboxThClass}>
                  <input
                    type="checkbox"
                    checked={allSelectableSelected}
                    onChange={toggleAll}
                    className={checkboxClass}
                  />
                </th>
              )}
              <th className="admin-th">Product</th>
              <th className="admin-th">Size</th>
              <th className="admin-th">Barcode</th>
              <th className={onSortChange ? sortableThClass : "admin-th"} onClick={() => onSortChange?.("price")}>
                Price
                {onSortChange && <SortIndicator active={sortBy === "price"} dir={sortDir} />}
              </th>
              <th className="admin-th">Consignor</th>
              <th className={onSortChange ? sortableThClass : "admin-th"} onClick={() => onSortChange?.("status")}>
                Status
                {onSortChange && <SortIndicator active={sortBy === "status"} dir={sortDir} />}
              </th>
              <th className={onSortChange ? sortableThClass : "admin-th"} onClick={() => onSortChange?.("date")}>
                Created
                {onSortChange && <SortIndicator active={sortBy === "date"} dir={sortDir} />}
              </th>
              {onCancel && <th className="admin-th">Actions</th>}
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

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col">
        {hasSelection && (
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
            <input
              type="checkbox"
              checked={allSelectableSelected}
              onChange={toggleAll}
              className={checkboxClass}
            />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Select all</span>
          </div>
        )}
        {listings.map((l) => (
          <FlatCardMobile
            key={l.id}
            listing={l}
            onCancel={onCancel}
            isLoading={isLoading}
            hasSelection={hasSelection}
            isSelected={selectedIds?.has(l.id) ?? false}
            onToggle={() => toggleId(l.id)}
          />
        ))}
      </div>
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
  const isSelectable = [LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.ACTIVE].includes(l.status);
  return (
    <tr className={flatRowClass}>
      {hasSelection && (
        <td className={checkboxTdClass}>
          {isSelectable ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggle}
              className={checkboxClass}
            />
          ) : (
            <span className="inline-block w-4" />
          )}
        </td>
      )}
      <td className="admin-td">
        <div className="flex items-center gap-2.5">
          {l.variant.product.imageUrl ? (
            <img
              src={l.variant.product.imageUrl}
              alt={l.variant.product.title}
              className="w-9 h-9 object-cover rounded border border-gray-200 shrink-0"
            />
          ) : (
            <span className="w-9 h-9 rounded bg-gray-100 flex items-center justify-center shrink-0">
              <Package size={16} className="text-gray-400" />
            </span>
          )}
          <div>
            <div className="font-medium">{l.variant.product.title}</div>
            <div className="text-[11px] text-gray-500 mt-px">
              {l.variant.product.sku ?? l.variant.product.brand ?? ""}
            </div>
          </div>
        </div>
      </td>
      <td className="admin-td">{l.variant.size}</td>
      <td className="admin-td text-[11px] font-mono text-gray-500">
        {l.variant.gtin || "\u2014"}
      </td>
      <td className="admin-td font-semibold tabular-nums">
        ${fmt(Number(l.price))}
      </td>
      <td className="admin-td">
        <div>{l.consignor.name}</div>
        <div className="text-[11px] text-gray-500 mt-px">{l.consignor.email}</div>
      </td>
      <td className="admin-td">
        <span className={statusBadgeClass(l.status)}>{statusLabel(l.status)}</span>
      </td>
      <td className="admin-td text-xs text-gray-500">
        {relativeTime(l.listedAt ?? l.createdAt)}
      </td>
      {onCancel && (
        <td className="admin-td">
          {l.status === LISTING_STATUS.ACTIVE ? (
            <s-button
              tone="critical"
              variant="tertiary"
              onClick={() => onCancel(l.id)}
              {...(isLoading ? { disabled: true } : {})}
            >
              Delete
            </s-button>
          ) : (
            <span className="text-gray-300">{"\u2014"}</span>
          )}
        </td>
      )}
    </tr>
  );
}

// ── FlatCardMobile sub-component ──

function FlatCardMobile({
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
  const isSelectable = [LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.ACTIVE].includes(l.status);
  return (
    <div className="px-3 py-3 border-b border-gray-100 bg-white">
      {/* Top: product image + title + size + price */}
      <div className="flex items-start gap-2.5">
        {hasSelection && (
          <span className="pt-1 shrink-0">
            {isSelectable ? (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={onToggle}
                className={checkboxClass}
              />
            ) : (
              <span className="inline-block w-4" />
            )}
          </span>
        )}
        {l.variant.product.imageUrl ? (
          <img
            src={l.variant.product.imageUrl}
            alt={l.variant.product.title}
            className="w-10 h-10 object-cover rounded border border-gray-200 shrink-0"
          />
        ) : (
          <span className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center shrink-0">
            <Package size={16} className="text-gray-400" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium text-sm text-gray-900 truncate">{l.variant.product.title}</div>
              <div className="text-[11px] text-gray-500 mt-px">
                {l.variant.product.sku ?? l.variant.product.brand ?? ""}
              </div>
            </div>
            <span className="font-bold text-sm tabular-nums text-gray-900 shrink-0">${fmt(Number(l.price))}</span>
          </div>
        </div>
      </div>
      {/* Middle: size + consignor + status */}
      <div className="flex items-center justify-between mt-2 ml-[66px]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 text-xs font-semibold rounded bg-gray-100 text-gray-700">{l.variant.size}</span>
          <span className="text-[13px] text-gray-700 truncate">{l.consignor.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={statusBadgeClass(l.status)}>{statusLabel(l.status)}</span>
        </div>
      </div>
      {/* Bottom: date + actions */}
      <div className="flex items-center justify-between mt-1.5 ml-[66px]">
        <span className="text-[11px] text-gray-400 tabular-nums">{relativeTime(l.listedAt ?? l.createdAt)}</span>
        {onCancel && l.status === LISTING_STATUS.ACTIVE && (
          <button
            onClick={() => onCancel(l.id)}
            disabled={isLoading}
            className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-red-200 bg-red-50 text-red-600 cursor-pointer font-[inherit] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-80"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
