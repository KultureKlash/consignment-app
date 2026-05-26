import { useState } from "react";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import type { Listing, ProductGroup, Props } from "./types";
import { tableClass } from "./listing-styles";
import { groupByProduct } from "./listing-utils";
import { GroupRows } from "./GroupRows";
import { RejectModal } from "./RejectModal";
import { EditListingModal } from "./EditListingModal";
import { EditProductModal } from "./EditProductModal";
import { ListingActionsProvider } from "./ListingActionsContext";
import type { ListingActions } from "./ListingActionsContext";

type GroupedViewProps = Pick<
  Props,
  | "listings"
  | "onCancel"
  | "onRestore"
  | "onApprove"
  | "onReject"
  | "onCheckin"
  | "onApproveWithdrawal"
  | "onDenyWithdrawal"
  | "onCompleteWithdrawal"
  | "onRetrySync"
  | "syncingListingId"
  | "onEditApprove"
  | "onAdminEdit"
  | "onUpdateCost"
  | "onEditProduct"
  | "onQuickAdd"
  | "isLoading"
  | "isNavigating"
  | "selectedIds"
  | "onSelectionChange"
  | "sections"
  | "onSectionChange"
>;

export function GroupedView({
  listings,
  onCancel,
  onRestore,
  onApprove,
  onReject,
  onCheckin,
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
  selectedIds,
  onSelectionChange,
  sections,
  onSectionChange,
}: GroupedViewProps) {
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [denyWithdrawalModal, setDenyWithdrawalModal] = useState<string | null>(null);
  const [denyWithdrawalReason, setDenyWithdrawalReason] = useState("");
  const [editModal, setEditModal] = useState<Listing | null>(null);
  const [editProductModal, setEditProductModal] = useState<ProductGroup | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Per-variant collapse state. Variants with 2+ listings render as a single
  // row by default; only expand when this set contains their id.
  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(new Set());

  const hasSelection = !!selectedIds && !!onSelectionChange;
  const colCount = (onCancel ? 7 : 6) + (hasSelection ? 1 : 0);

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

  const toggleVariant = (variantId: string) => {
    setExpandedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId); else next.add(variantId);
      return next;
    });
  };

  const toggleId = (id: string) => {
    if (!selectedIds || !onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
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

  const handleDenyWithdrawalConfirm = () => {
    if (denyWithdrawalModal && denyWithdrawalReason.trim() && onDenyWithdrawal) {
      onDenyWithdrawal(denyWithdrawalModal, denyWithdrawalReason.trim());
      setDenyWithdrawalModal(null);
      setDenyWithdrawalReason("");
    }
  };

  const groups = groupByProduct(listings);

  const actionsValue: ListingActions = {
    onCancel,
    onRestore,
    onApprove,
    onReject: onReject ? (id: string) => { setRejectModal(id); setRejectReason(""); } : undefined,
    onCheckin,
    onApproveWithdrawal,
    onDenyWithdrawal: onDenyWithdrawal ? (id: string) => { setDenyWithdrawalModal(id); setDenyWithdrawalReason(""); } : undefined,
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
    expandedVariants,
    onToggleVariant: toggleVariant,
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
        {/* Mobile: cards -- outside table element */}
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
      {denyWithdrawalModal && (
        <RejectModal
          onConfirm={handleDenyWithdrawalConfirm}
          onCancel={() => setDenyWithdrawalModal(null)}
          reason={denyWithdrawalReason}
          setReason={setDenyWithdrawalReason}
          title="Deny Withdrawal Request"
          description="Provide a reason for denying this withdrawal. The consignor will see this in their email."
          placeholder="e.g. Item is part of a pending sale, please retry next week..."
          confirmLabel="Deny Withdrawal"
        />
      )}
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
