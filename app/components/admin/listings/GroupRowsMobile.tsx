import { RefreshCw } from "lucide-react";
import { fmt } from "~/lib/currency";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import type { ProductGroup } from "./types";
import { ChevronRight, Package } from "lucide-react";
import { checkboxClass } from "./listing-styles";
import { useListingActions } from "./ListingActionsContext";

export function GroupRowsMobile({
  group,
  isExpanded,
  onToggle,
  hasSelection,
  sortedListings,
  groupSelectableIds,
  allGroupSelected,
}: {
  group: ProductGroup;
  isExpanded: boolean;
  onToggle: () => void;
  hasSelection: boolean;
  sortedListings: ProductGroup["listings"];
  groupSelectableIds: string[];
  allGroupSelected: boolean;
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
    onAdminEdit,
    isLoading,
    selectedIds,
    onToggleId,
    onToggleGroup,
  } = useListingActions();

  return (
    <div className="border-b-2 border-gray-200">
      {/* Product header — tap anywhere to toggle */}
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-3 py-2.5 bg-white cursor-pointer border-0 text-left font-[inherit]">
        <span className={`transition-transform duration-200 shrink-0 ${isExpanded ? "rotate-90" : ""}`}>
          <ChevronRight size={14} className="text-gray-400" />
        </span>
        {group.imageUrl ? (
          <img src={group.imageUrl} alt="" className="w-10 h-10 object-cover rounded-lg border border-gray-200 shrink-0" />
        ) : (
          <span className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <Package size={16} className="text-gray-400" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-900 truncate">{group.title}</div>
          <div className="text-[11px] text-gray-500">{group.brand}{group.brand ? " · " : ""}<span className="text-emerald-600 font-semibold">{group.listings.filter((l) => l.status === LISTING_STATUS.ACTIVE).length} active</span></div>
        </div>
      </button>
      {/* Expanded listings — NO parent click handlers */}
      {isExpanded && (
        <div>
          {hasSelection && groupSelectableIds.length > 0 && (
            <label className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-100 bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={allGroupSelected} onChange={() => onToggleGroup(groupSelectableIds)} className={checkboxClass} />
              <span className="text-[10px] font-bold text-gray-400 uppercase">Select all</span>
            </label>
          )}
          {sortedListings.map((l, i) => {
            const isSelectable = [LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.ACTIVE].includes(l.status);
            return (
              <div key={l.id} className={`px-3 py-1.5 flex items-center gap-1.5 bg-white ${i < sortedListings.length - 1 ? "border-t border-gray-100" : ""}`}>
                {hasSelection && (
                  isSelectable ? (
                    <input type="checkbox" checked={selectedIds?.has(l.id) ?? false} onChange={() => onToggleId(l.id)} className={`${checkboxClass} shrink-0`} />
                  ) : <span className="inline-block w-4 shrink-0" />
                )}
                <span className="font-semibold text-[13px] text-gray-900 w-7 shrink-0 text-center">{l.variant.size}</span>
                <span className="font-bold text-[13px] tabular-nums text-gray-900 shrink-0">${fmt(Number(l.price))}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-gray-700 truncate">{l.consignor.name}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {l.status === LISTING_STATUS.SUBMITTED && onApprove && (
                    <>
                      <button type="button" onClick={() => onApprove(l.id)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-bold rounded-md bg-teal-50 text-teal-600 border border-teal-200 cursor-pointer disabled:opacity-50 font-[inherit]">✓</button>
                      {onReject && <button type="button" onClick={() => onReject(l.id)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-bold rounded-md bg-red-50 text-red-600 border border-red-200 cursor-pointer disabled:opacity-50 font-[inherit]">✕</button>}
                    </>
                  )}
                  {l.status === LISTING_STATUS.APPROVED && onCheckin && (
                    <button type="button" onClick={() => onCheckin(l.id)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-blue-50 text-blue-600 border border-blue-200 cursor-pointer disabled:opacity-50 font-[inherit]">Check in</button>
                  )}
                  {onAdminEdit && ![LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.CANCELLED, LISTING_STATUS.REJECTED, LISTING_STATUS.WITHDRAWN, LISTING_STATUS.WITHDRAWAL_REQUESTED, LISTING_STATUS.PENDING_PICKUP].includes(l.status) && !(l.status === LISTING_STATUS.SOLD && !l.consignor.storeOwned) && (
                    <button type="button" onClick={() => onAdminEdit(l)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-violet-50 text-violet-600 border border-violet-200 cursor-pointer disabled:opacity-50 font-[inherit]">Edit</button>
                  )}
                  {l.status === LISTING_STATUS.ACTIVE && onCancel && (
                    <button type="button" onClick={() => onCancel(l.id)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-red-50 text-red-600 border border-red-200 cursor-pointer disabled:opacity-50 font-[inherit]">Del</button>
                  )}
                  {l.status === LISTING_STATUS.WITHDRAWAL_REQUESTED && onApproveWithdrawal && (
                    <button type="button" onClick={() => onApproveWithdrawal(l.id)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-orange-50 text-orange-600 border border-orange-200 cursor-pointer disabled:opacity-50 font-[inherit]">Approve</button>
                  )}
                  {l.status === LISTING_STATUS.WITHDRAWAL_REQUESTED && onDenyWithdrawal && (
                    <button type="button" onClick={() => onDenyWithdrawal(l.id)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-red-50 text-red-600 border border-red-200 cursor-pointer disabled:opacity-50 font-[inherit]">Deny</button>
                  )}
                  {l.status === LISTING_STATUS.PENDING_PICKUP && onCompleteWithdrawal && (
                    <button type="button" onClick={() => onCompleteWithdrawal(l.id)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-cyan-50 text-cyan-600 border border-cyan-200 cursor-pointer disabled:opacity-50 font-[inherit]">Done</button>
                  )}
                  {l.status === LISTING_STATUS.CANCELLED && onRestore && (
                    <button type="button" onClick={() => onRestore(l.id)} disabled={isLoading} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-pointer disabled:opacity-50 font-[inherit]">Restore</button>
                  )}
                  {!l.variant.shopifyVariantId && l.status === LISTING_STATUS.ACTIVE && onRetrySync && (
                    <button type="button" onClick={() => onRetrySync(l.id)} disabled={syncingListingId === l.id} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-blue-50 text-blue-500 border border-blue-200 cursor-pointer disabled:opacity-50 font-[inherit]">
                      <span className="inline-flex items-center gap-1"><RefreshCw size={10} className={syncingListingId === l.id ? "animate-spin" : ""} /> {syncingListingId === l.id ? "Syncing..." : "Retry Sync"}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
