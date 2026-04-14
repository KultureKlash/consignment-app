import { useState, useCallback } from "react";
import { Package, ChevronRight, Plus, Check, X, Zap, Pencil } from "lucide-react";
import { statusBadgeClass, relativeTime, statusLabel } from "./listing-ui";
import { fmt } from "~/lib/currency";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import type { Listing, ProductGroup, SectionOption, SortKey } from "./types";
import {
  groupHeaderClass,
  groupHeaderCellClass,
  chevronWrapClass,
  qtyBadgeClass,
  childRowClass,
  childIndentTdClass,
  childHeaderClass,
  childThClass,
  childSortableThClass,
  priceCellClass,
  consignorNameClass,
  consignorEmailClass,
  dateCellClass,
  checkboxClass,
  checkboxTdClass,
  SortIndicator,
  StatusCounts,
  ActionBtn,
} from "./listingHelpers";
import { SectionPicker } from "./SectionPicker";

export function GroupRows({
  group,
  isExpanded,
  onToggle,
  onCancel,
  onRestore,
  onApprove,
  onReject,
  onCheckin,
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
  onCheckin?: (id: string) => void;
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

  const groupSelectableIds = group.listings.filter((l) => [LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.ACTIVE].includes(l.status)).map((l) => l.id);
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
        className={`${groupHeaderClass} ${isExpanded ? "border-b-gray-300 bg-gray-50" : ""}`}
        onClick={onToggle}
      >
        <td colSpan={colCount} className={groupHeaderCellClass}>
          <div className="flex items-center gap-2.5">
            <span
              className={`${chevronWrapClass} ${isExpanded ? "rotate-90 bg-gray-200" : ""}`}
            >
              <ChevronRight size={14} strokeWidth={2.5} />
            </span>

            {group.imageUrl ? (
              <img
                src={group.imageUrl}
                alt={group.title}
                className="w-12 h-12 object-cover rounded-md border border-gray-200 shrink-0"
              />
            ) : (
              <span className="w-12 h-12 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                <Package size={20} className="text-gray-400" />
              </span>
            )}

            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[13.5px] text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis">
                  {group.title}
                </span>
                {group.brand && (
                  <span className="text-xs text-gray-500 font-medium whitespace-nowrap shrink-0">
                    {group.brand}
                  </span>
                )}
                {/* Edit product button */}
                {onEditProduct && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditProduct(group); }}
                    className="bg-transparent border-0 cursor-pointer p-0.5 text-gray-300 hover:text-gray-500 transition-colors duration-150 shrink-0"
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
              <div className="flex items-center gap-2">
                {group.sku && (
                  <span className="text-[11px] text-gray-400 font-mono tracking-wide">
                    {group.sku}
                  </span>
                )}
                <StatusCounts listings={group.listings} />
              </div>
            </div>

            <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
              {onQuickAdd ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAdd(group.productId, e.currentTarget as HTMLElement);
                  }}
                  className="w-[30px] h-[30px] rounded-lg border border-gray-200 bg-white cursor-pointer flex items-center justify-center text-gray-500 transition-all duration-150 p-0 hover:bg-gray-100 hover:border-gray-400 hover:text-gray-900"
                  title="Quick add listing"
                >
                  <Plus size={16} strokeWidth={2.5} />
                </button>
              ) : (
                <span className={qtyBadgeClass}>
                  {group.listings.filter((l) => l.status === LISTING_STATUS.ACTIVE).length}
                </span>
              )}
            </div>
          </div>
        </td>
      </tr>

      {/* Column headers — only when expanded */}
      {isExpanded && (
        <tr ref={scrollRef} className={childHeaderClass}>
          {hasSelection && (
            <td className={`${childThClass} w-9 pr-0`} onClick={(e) => e.stopPropagation()}>
              {groupSelectableIds.length > 0 && (
                <input
                  type="checkbox"
                  checked={allGroupSelected}
                  onChange={() => onToggleGroup(groupSelectableIds)}
                  className={checkboxClass}
                />
              )}
            </td>
          )}
          <td className={`${childThClass} pl-[42px]`}>Size</td>
          <td className={childThClass}>Barcode</td>
          <td className={childSortableThClass} onClick={() => handleLocalSort("price")}>
            Price
            <SortIndicator active={localSortKey === "price"} dir={localSortDir} />
          </td>
          <td className={childThClass}>Consignor</td>
          <td className={childSortableThClass} onClick={() => handleLocalSort("status")}>
            Status
            <SortIndicator active={localSortKey === "status"} dir={localSortDir} />
          </td>
          <td className={childSortableThClass} onClick={() => handleLocalSort("date")}>
            Created
            <SortIndicator active={localSortKey === "date"} dir={localSortDir} />
          </td>
          {(onCancel || onApprove) && <td className={childThClass}>Actions</td>}
        </tr>
      )}

      {/* Child listing rows */}
      {isExpanded && sortedListings.map((l, i) => {
        const isSelectable = [LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.ACTIVE].includes(l.status);
        return (
          <tr
            key={l.id}
            className={`${childRowClass} ${i === sortedListings.length - 1 ? "border-b-2 border-b-gray-200" : ""}`}
          >
            {hasSelection && (
              <td className={checkboxTdClass} onClick={(e) => e.stopPropagation()}>
                {isSelectable ? (
                  <input
                    type="checkbox"
                    checked={selectedIds?.has(l.id) ?? false}
                    onChange={() => onToggleId(l.id)}
                    className={checkboxClass}
                  />
                ) : (
                  <span className="inline-block w-4" />
                )}
              </td>
            )}
            <td className={childIndentTdClass}>
              <span className="font-semibold">{l.variant.size}</span>
            </td>
            <td className="admin-td text-[11px] font-mono text-gray-400 tracking-wide">
              {l.variant.gtin || "\u2014"}
            </td>
            <td className={priceCellClass}>
              ${fmt(Number(l.price))}
            </td>
            <td className="admin-td">
              <div className={consignorNameClass}>{l.consignor.name}</div>
              <div className={consignorEmailClass}>{l.consignor.email}</div>
            </td>
            <td className="admin-td">
              <span className={statusBadgeClass(l.status)}>{statusLabel(l.status)}</span>
            </td>
            <td className={dateCellClass}>
              {relativeTime(l.createdAt)}
            </td>
            {(onCancel || onApprove) && (
              <td className="admin-td">
                <div className="flex gap-1 items-center">
                  {l.status === LISTING_STATUS.SUBMITTED && onApprove && (
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
                  {l.status === LISTING_STATUS.APPROVED && onCheckin && (
                    <ActionBtn
                      label="Check in"
                      icon={<Zap size={13} />}
                      color="#2c6ecb"
                      bg="#eff6ff"
                      border="#bfdbfe"
                      onClick={() => onCheckin(l.id)}
                      disabled={isLoading}
                    />
                  )}
                  {onAdminEdit && ![LISTING_STATUS.SUBMITTED, LISTING_STATUS.SOLD, LISTING_STATUS.CANCELLED, LISTING_STATUS.REJECTED, LISTING_STATUS.WITHDRAWN].includes(l.status) && (
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
                  {l.status === LISTING_STATUS.ACTIVE && onCancel && (
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
                  {l.status === LISTING_STATUS.WITHDRAWAL_REQUESTED && onApproveWithdrawal && (
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
                  {l.status === LISTING_STATUS.PENDING_PICKUP && onCompleteWithdrawal && (
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
                  {l.status === LISTING_STATUS.CANCELLED && onRestore && (
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
                  {![LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.ACTIVE, LISTING_STATUS.WITHDRAWAL_REQUESTED, LISTING_STATUS.PENDING_PICKUP, LISTING_STATUS.CANCELLED].includes(l.status) && (
                    <span className="text-gray-300">{"\u2014"}</span>
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
