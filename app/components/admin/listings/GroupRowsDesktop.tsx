import { Package, ChevronRight, Plus, Check, X, Zap, Pencil, RefreshCw } from "lucide-react";
import { statusBadgeClass, relativeTime, statusLabel } from "./listing-ui";
import { fmt } from "~/lib/currency";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import type { ProductGroup, SortKey } from "./types";
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
} from "./listing-styles";
import { SortIndicator, StatusCounts, ActionBtn, groupByVariant } from "./listing-utils";
import { SectionPicker } from "./SectionPicker";
import { useListingActions } from "./ListingActionsContext";

export function GroupRowsDesktop({
  group,
  isExpanded,
  onToggle,
  colCount,
  hasSelection,
  sortedListings,
  groupSelectableIds,
  allGroupSelected,
  localSortKey,
  localSortDir,
  handleLocalSort,
  localSectionId,
  setLocalSectionId,
  scrollRef,
}: {
  group: ProductGroup;
  isExpanded: boolean;
  onToggle: () => void;
  colCount: number;
  hasSelection: boolean;
  sortedListings: ProductGroup["listings"];
  groupSelectableIds: string[];
  allGroupSelected: boolean;
  localSortKey: SortKey | null;
  localSortDir: "asc" | "desc";
  handleLocalSort: (key: SortKey) => void;
  localSectionId: string;
  setLocalSectionId: (id: string) => void;
  scrollRef: (node: HTMLTableRowElement | null) => void;
}) {
  const {
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
    onEditProduct,
    onQuickAdd,
    isLoading,
    selectedIds,
    onToggleId,
    onToggleGroup,
    sections,
    onSectionChange,
    expandedVariants,
    onToggleVariant,
  } = useListingActions();

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
                className="w-16 h-16 object-cover rounded-lg border border-gray-200 shrink-0"
              />
            ) : (
              <span className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
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

      {/* Desktop: Column headers — only when expanded */}
      {isExpanded && (
        <tr ref={scrollRef} className={`${childHeaderClass} hidden md:table-row`}>
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

      {/* Desktop: Child listing rows, grouped by variant so multi-listing sizes
          collapse into a single header row that expands on click. */}
      {isExpanded && (() => {
        const variantGroups = groupByVariant(sortedListings);
        const rows: React.ReactNode[] = [];

        variantGroups.forEach((vg, vgIdx) => {
          const isLastGroup = vgIdx === variantGroups.length - 1;
          const variantHasHeader = vg.listings.length >= 2;
          const variantOpen = !variantHasHeader || (expandedVariants?.has(vg.variantId) ?? false);

          // Selectable listings inside this variant — drives the tri-state checkbox.
          const variantSelectableIds = vg.listings
            .filter((l) => ([LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.ACTIVE, LISTING_STATUS.WITHDRAWAL_REQUESTED, LISTING_STATUS.PENDING_PICKUP] as string[]).includes(l.status))
            .map((l) => l.id);
          const variantAllSelected = variantSelectableIds.length > 0
            && variantSelectableIds.every((id) => selectedIds?.has(id) ?? false);
          const variantSomeSelected = !variantAllSelected
            && variantSelectableIds.some((id) => selectedIds?.has(id) ?? false);

          if (variantHasHeader) {
            // Compute price spread for the header row's "$X – $Y" hint.
            const prices = vg.listings.map((l) => l.price).filter((p): p is number => p != null);
            const priceText = prices.length === 0
              ? null
              : Math.min(...prices) === Math.max(...prices)
                ? `$${fmt(Math.min(...prices))}`
                : `$${fmt(Math.min(...prices))} – $${fmt(Math.max(...prices))}`;

            // Trailing cells after size + barcode + price.
            const contentCols = colCount - (hasSelection ? 1 : 0);
            const trailingColSpan = contentCols - 3;

            rows.push(
              <tr
                key={`vgh-${vg.variantId}`}
                className={`hidden md:table-row cursor-pointer transition-colors duration-100 ${variantOpen ? "bg-gray-50" : "bg-white hover:bg-gray-50"} ${variantOpen ? "" : (isLastGroup ? "border-b-2 border-b-gray-200" : "border-b border-b-gray-200/40")}`}
                onClick={() => onToggleVariant?.(vg.variantId)}
              >
                {hasSelection && (
                  <td className={checkboxTdClass} onClick={(e) => e.stopPropagation()}>
                    {variantSelectableIds.length > 0 ? (
                      <input
                        type="checkbox"
                        checked={variantAllSelected}
                        ref={(el) => { if (el) el.indeterminate = variantSomeSelected; }}
                        onChange={() => onToggleGroup(variantSelectableIds)}
                        className={checkboxClass}
                      />
                    ) : (
                      <span className="inline-block w-4" />
                    )}
                  </td>
                )}
                {/* Size: chevron sits in the indent gutter so the size digit
                    lines up exactly with the size column below. */}
                <td className={`${childIndentTdClass} relative`}>
                  <ChevronRight
                    size={12}
                    className={`absolute left-[24px] top-1/2 -translate-y-1/2 text-gray-400 transition-transform ${variantOpen ? "rotate-90" : ""}`}
                  />
                  <span className="font-bold text-[13px] text-gray-900">{vg.size}</span>
                </td>
                <td className="admin-td">
                  <span className="text-[11px] text-gray-500">{vg.listings.length} listings</span>
                </td>
                <td className={priceCellClass}>
                  {priceText && !variantOpen && (
                    <span className="text-[11.5px] font-normal text-gray-500 tabular-nums">{priceText}</span>
                  )}
                </td>
                {trailingColSpan > 0 && <td colSpan={trailingColSpan} className="admin-td" />}
              </tr>,
            );
          }

          if (!variantOpen) return;

          vg.listings.forEach((l, i) => {
            const isSelectable = ([LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.ACTIVE, LISTING_STATUS.WITHDRAWAL_REQUESTED, LISTING_STATUS.PENDING_PICKUP] as string[]).includes(l.status);
            const isLastRow = isLastGroup && i === vg.listings.length - 1;
            rows.push(
          <tr
            key={l.id}
            className={`${childRowClass} hidden md:table-row ${isLastRow ? "border-b-2 border-b-gray-200" : ""}`}
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
              {l.price != null ? `$${fmt(Number(l.price))}` : <span className="text-amber-600 text-xs font-semibold">Needs price</span>}
            </td>
            <td className="admin-td">
              <div className={consignorNameClass}>{l.consignor.name}</div>
              <div className={consignorEmailClass}>{l.consignor.email}</div>
            </td>
            <td className="admin-td">
              <span className={statusBadgeClass(l.status)}>{statusLabel(l.status)}</span>
              {!l.variant.shopifyVariantId && l.status === LISTING_STATUS.ACTIVE && (
                <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-px text-[10px] font-medium rounded bg-amber-50 text-amber-600">
                  Not live on Shopify
                </span>
              )}
            </td>
            <td className={dateCellClass}>
              {relativeTime(l.listedAt ?? l.createdAt)}
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
                          color="#2563eb"
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
                      icon={<Check size={13} />}
                      color="#2c6ecb"
                      bg="#eff6ff"
                      border="#bfdbfe"
                      onClick={() => onCheckin(l.id)}
                      disabled={isLoading}
                    />
                  )}
                  {onAdminEdit && ![LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.CANCELLED, LISTING_STATUS.REJECTED, LISTING_STATUS.WITHDRAWN, LISTING_STATUS.WITHDRAWAL_REQUESTED, LISTING_STATUS.PENDING_PICKUP].includes(l.status) && !(l.status === LISTING_STATUS.SOLD && !l.consignor.storeOwned) && (
                    <ActionBtn
                      label="Edit"
                      icon={<Pencil size={13} />}
                      color="#2563eb"
                      bg="#f5f3ff"
                      border="#c4b5fd"
                      onClick={() => onAdminEdit(l)}
                      disabled={isLoading}
                    />
                  )}
                  {l.status === LISTING_STATUS.ACTIVE && onCancel && (
                    <ActionBtn
                      label="Delete"
                      icon={<X size={13} />}
                      color="#dc2626"
                      bg="#fef2f2"
                      border="#fecaca"
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
                  {l.status === LISTING_STATUS.WITHDRAWAL_REQUESTED && onDenyWithdrawal && (
                    <ActionBtn
                      label="Deny Withdrawal"
                      icon={<X size={13} />}
                      color="#dc2626"
                      bg="#fef2f2"
                      border="#fecaca"
                      onClick={() => onDenyWithdrawal(l.id)}
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
                  {!l.variant.shopifyVariantId && l.status === LISTING_STATUS.ACTIVE && onRetrySync && (
                    <ActionBtn
                      label={syncingListingId === l.id ? "Syncing..." : "Retry Sync"}
                      icon={<RefreshCw size={13} className={syncingListingId === l.id ? "animate-spin" : ""} />}
                      color="#3b82f6"
                      bg="#eff6ff"
                      border="#bfdbfe"
                      onClick={() => onRetrySync(l.id)}
                      disabled={syncingListingId === l.id}
                    />
                  )}
                  {![LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.ACTIVE, LISTING_STATUS.WITHDRAWAL_REQUESTED, LISTING_STATUS.PENDING_PICKUP, LISTING_STATUS.CANCELLED].includes(l.status) && (
                    <span className="text-gray-300">{"\u2014"}</span>
                  )}
                </div>
              </td>
            )}
          </tr>,
            );
          });
        });

        return rows;
      })()}

      {/* Mobile: Card layout for child listings */}
      {isExpanded && (
        <tr className="md:hidden">
          <td colSpan={colCount} className="p-0">
            {/* Group checkbox for mobile */}
            {hasSelection && groupSelectableIds.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                <input
                  type="checkbox"
                  checked={allGroupSelected}
                  onChange={() => onToggleGroup(groupSelectableIds)}
                  className={checkboxClass}
                />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Select all</span>
              </div>
            )}
            <div className="flex flex-col">
              {sortedListings.map((l, i) => {
                const isSelectable = ([LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.ACTIVE, LISTING_STATUS.WITHDRAWAL_REQUESTED, LISTING_STATUS.PENDING_PICKUP] as string[]).includes(l.status);
                return (
                  <div
                    key={l.id}
                    className={`px-2 py-1.5 bg-white flex items-center gap-1.5 ${i < sortedListings.length - 1 ? "border-b border-gray-100" : "border-b-2 border-gray-200"}`}
                  >
                    {hasSelection && (
                      <span onClick={(e) => e.stopPropagation()} className="shrink-0">
                        {isSelectable ? (
                          <input type="checkbox" checked={selectedIds?.has(l.id) ?? false} onChange={() => onToggleId(l.id)} className={checkboxClass} />
                        ) : (
                          <span className="inline-block w-4" />
                        )}
                      </span>
                    )}
                    <span className="font-semibold text-[13px] text-gray-900 w-7 shrink-0 text-center">{l.variant.size}</span>
                    <span className="font-bold text-[13px] tabular-nums text-gray-900 shrink-0">{l.price != null ? `$${fmt(Number(l.price))}` : <span className="text-amber-600 text-[11px]">No price</span>}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-gray-700 truncate leading-tight">{l.consignor.name}</div>
                      {l.variant.gtin && <div className="text-[9px] font-mono text-gray-400 truncate leading-tight">{l.variant.gtin}</div>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {l.status === LISTING_STATUS.SUBMITTED && onApprove && (
                        <>
                          <button onClick={() => onApprove(l.id)} disabled={isLoading} className="px-2 py-0.5 text-[10px] font-semibold rounded bg-teal-50 text-teal-600 border border-teal-200 cursor-pointer disabled:opacity-50">✓</button>
                          {onReject && <button onClick={() => onReject(l.id)} disabled={isLoading} className="px-2 py-0.5 text-[10px] font-semibold rounded bg-red-50 text-red-600 border border-red-200 cursor-pointer disabled:opacity-50">✕</button>}
                        </>
                      )}
                      {l.status === LISTING_STATUS.APPROVED && onCheckin && (
                        <button onClick={() => onCheckin(l.id)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-blue-50 text-blue-600 border border-blue-200 cursor-pointer disabled:opacity-50">Check in</button>
                      )}
                      {onAdminEdit && ![LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.CANCELLED, LISTING_STATUS.REJECTED, LISTING_STATUS.WITHDRAWN, LISTING_STATUS.WITHDRAWAL_REQUESTED, LISTING_STATUS.PENDING_PICKUP].includes(l.status) && !(l.status === LISTING_STATUS.SOLD && !l.consignor.storeOwned) && (
                        <button onClick={() => onAdminEdit(l)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-violet-50 text-violet-600 border border-violet-200 cursor-pointer disabled:opacity-50">Edit</button>
                      )}
                      {l.status === LISTING_STATUS.ACTIVE && onCancel && (
                        <button onClick={() => onCancel(l.id)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-red-50 text-red-600 border border-red-200 cursor-pointer disabled:opacity-50">Del</button>
                      )}
                      {l.status === LISTING_STATUS.WITHDRAWAL_REQUESTED && onApproveWithdrawal && (
                        <button onClick={() => onApproveWithdrawal(l.id)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-orange-50 text-orange-600 border border-orange-200 cursor-pointer disabled:opacity-50">Approve</button>
                      )}
                      {l.status === LISTING_STATUS.WITHDRAWAL_REQUESTED && onDenyWithdrawal && (
                        <button onClick={() => onDenyWithdrawal(l.id)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-red-50 text-red-600 border border-red-200 cursor-pointer disabled:opacity-50">Deny</button>
                      )}
                      {l.status === LISTING_STATUS.PENDING_PICKUP && onCompleteWithdrawal && (
                        <button onClick={() => onCompleteWithdrawal(l.id)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-cyan-50 text-cyan-600 border border-cyan-200 cursor-pointer disabled:opacity-50">Done</button>
                      )}
                      {l.status === LISTING_STATUS.CANCELLED && onRestore && (
                        <button onClick={() => onRestore(l.id)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-pointer disabled:opacity-50">Restore</button>
                      )}
                      {!l.variant.shopifyVariantId && l.status === LISTING_STATUS.ACTIVE && onRetrySync && (
                        <button onClick={() => onRetrySync(l.id)} disabled={syncingListingId === l.id} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-blue-50 text-blue-500 border border-blue-200 cursor-pointer disabled:opacity-50">
                          <span className="inline-flex items-center gap-1"><RefreshCw size={10} className={syncingListingId === l.id ? "animate-spin" : ""} /> {syncingListingId === l.id ? "Syncing..." : "Retry"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
