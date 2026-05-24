import { useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";
import { Plus, Package, Trash2, Pencil, ChevronDown, ChevronRight, PackageX, DollarSign } from "lucide-react";
import { InfoTip } from "~/components/portal/InfoTip";
import { fmt } from "~/lib/currency";
import { StatusBadge } from "./StatusBadge";
import { InlinePrice } from "./InlinePrice";
import { daysListedLabel, LISTING_STATUS } from "./listingHelpers";
import type { ProductGroup } from "./listingHelpers";

interface ListingGroupProps {
  group: ProductGroup;
  isOpen: boolean;
  onToggle: () => void;
  lowestPrices: Record<string, number>;
  onConfirmDelete: (listingId: string) => void;
  onConfirmWithdraw: (listingId: string) => void;
  /** Mobile: callback when tapping a listing row */
  onMobileDetail?: (listingId: string) => void;
  /** Whether to render the mobile variant (true) or desktop variant (false) */
  mobile?: boolean;
  /** Bulk-selection: set of selected listing IDs (only ACTIVE rows render a checkbox) */
  selectedIds?: Set<string>;
  /** Bulk-selection: toggle handler */
  onToggleSelect?: (listingId: string) => void;
  /** Bulk-selection: toggle every ACTIVE listing in this group */
  onToggleSelectGroup?: (listingIds: string[], select: boolean) => void;
}

function BulkPriceModal({ count, listingIds, onClose }: { count: number; listingIds: string[]; onClose: () => void }) {
  const fetcher = useFetcher();
  const [price, setPrice] = useState("");
  const isSubmitting = fetcher.state !== "idle";
  const data = fetcher.data as { ok?: boolean; error?: string } | undefined;

  useEffect(() => {
    if (fetcher.state === "idle" && data?.ok) onClose();
  }, [fetcher.state, data, onClose]);

  const handleApply = () => {
    const parsed = parseFloat(price);
    if (isNaN(parsed) || parsed <= 0) return;
    const fd = new FormData();
    fd.set("intent", "bulk-set-initial-price");
    fd.set("price", parsed.toFixed(2));
    for (const id of listingIds) fd.append("listingIds", id);
    fetcher.submit(fd, { method: "POST" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-panel rounded-2xl p-6 w-[90%] max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">Set price for all {count} item{count !== 1 ? "s" : ""}</h3>
        <p className="text-xs text-muted-foreground mb-4">This price will be applied to every unpriced listing in this product group.</p>
        <div className="relative mb-4">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
            autoFocus
            placeholder="0.00"
            className="glass-input w-full pl-7 pr-3 py-2.5 rounded-xl text-sm"
          />
        </div>
        {data?.error && <p className="text-xs text-red-400 mb-3">{data.error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/[0.06] hover:bg-white/[0.1] cursor-pointer transition-colors">Cancel</button>
          <button
            onClick={handleApply}
            disabled={isSubmitting || !price.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-amber-400/15 text-amber-300 hover:bg-amber-400/25 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Applying..." : `Apply to ${count}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ListingGroup({
  group,
  isOpen,
  onToggle,
  lowestPrices,
  onConfirmDelete,
  onConfirmWithdraw,
  onMobileDetail,
  mobile,
  selectedIds,
  onToggleSelect,
  onToggleSelectGroup,
}: ListingGroupProps) {
  const unpricedListings = group.listings.filter((l) => l.status === LISTING_STATUS.AWAITING_PRICE);
  const activeListings = group.listings.filter((l) => l.status === LISTING_STATUS.ACTIVE);
  const activeIds = activeListings.map((l) => l.id);
  const selectedInGroup = selectedIds ? activeIds.filter((id) => selectedIds.has(id)).length : 0;
  const allSelectedInGroup = activeIds.length > 0 && selectedInGroup === activeIds.length;
  const [showBulkModal, setShowBulkModal] = useState(false);
  if (mobile) {
    return (
      <div>
        <div className="relative">
          <button
            onClick={onToggle}
            className="w-full flex items-center gap-2.5 px-4 pr-10 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
          >
            {isOpen
              ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            }
            {group.imageUrl ? (
              <img src={group.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-[rgba(255,255,255,0.08)] shrink-0" />
            ) : (
              <span className="w-16 h-16 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
                <Package className="w-4 h-4 text-muted-foreground" />
              </span>
            )}
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{group.title}</span>
                {group.listings.some((l) => l.status === LISTING_STATUS.WITHDRAWAL_REQUESTED || l.status === LISTING_STATUS.PENDING_PICKUP) && (
                  <span className="w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.5)] shrink-0" title="Withdrawal in progress" />
                )}
              </div>
              {group.brand && <div className="truncate text-[11px] text-muted-foreground">{group.brand}</div>}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {group.listings.length} item{group.listings.length !== 1 ? "s" : ""}
            </span>
          </button>
          <Link
            to={`/portal/listings/new?productId=${group.productId}`}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
            title="Add another"
            onClick={(e) => e.stopPropagation()}
          >
            <Plus className="w-3.5 h-3.5" />
          </Link>
        </div>
        {isOpen && unpricedListings.length >= 2 && (
          <button
            onClick={() => setShowBulkModal(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-amber-300 bg-amber-400/10 hover:bg-amber-400/15 border-t border-amber-400/20 cursor-pointer transition-colors"
          >
            <DollarSign className="w-3.5 h-3.5" />
            Set price for all {unpricedListings.length}
          </button>
        )}
        {isOpen && activeListings.length >= 2 && onToggleSelectGroup && (
          <button
            onClick={() => onToggleSelectGroup(activeIds, !allSelectedInGroup)}
            className={`w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold border-t border-orange-400/20 cursor-pointer transition-colors ${allSelectedInGroup ? "text-orange-200 bg-orange-400/15 hover:bg-orange-400/20" : "text-orange-300 bg-orange-400/10 hover:bg-orange-400/15"}`}
          >
            {allSelectedInGroup ? `Unselect all ${activeListings.length}` : `Select all ${activeListings.length} active`}
          </button>
        )}
        {isOpen && group.listings.map((listing) => {
          const selectable = listing.status === LISTING_STATUS.ACTIVE && onToggleSelect;
          const isSelected = !!(selectable && selectedIds?.has(listing.id));
          return (
            <div key={listing.id} onClick={() => onMobileDetail?.(listing.id)} className={`flex items-center gap-2 pl-3 pr-4 py-3 bg-white/[0.02] border-t border-[rgba(255,255,255,0.04)] cursor-pointer active:bg-white/[0.06] transition-colors ${isSelected ? "bg-orange-400/[0.06]" : ""}`}>
              {selectable ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleSelect!(listing.id); }}
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${isSelected ? "bg-orange-400/30 border-orange-400/60" : "border-white/20 hover:border-white/40"}`}
                  aria-label={isSelected ? "Unselect" : "Select for batch withdrawal"}
                  aria-pressed={isSelected}
                >
                  {isSelected && <span className="block w-2 h-2 rounded-sm bg-orange-300" />}
                </button>
              ) : (
                <span className="w-5 shrink-0" aria-hidden />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-foreground">Size {listing.variant.size}</span>
                  {listing.status === LISTING_STATUS.AWAITING_PRICE
                    ? <span className="shrink-0 ml-2 text-xs font-semibold text-amber-300">Tap to set price</span>
                    : <span className="shrink-0 ml-2 text-sm font-bold tabular-nums">{listing.price != null ? `$${fmt(listing.price)}` : "—"}</span>
                  }
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {daysListedLabel(listing.listedAt ?? listing.createdAt, listing.status)}
                  </span>
                  <StatusBadge status={listing.status} />
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
            </div>
          );
        })}
        {showBulkModal && (
          <BulkPriceModal
            count={unpricedListings.length}
            listingIds={unpricedListings.map((l) => l.id)}
            onClose={() => setShowBulkModal(false)}
          />
        )}
      </div>
    );
  }

  // Desktop variant
  return (
    <div className={isOpen ? "border-b border-[rgba(255,255,255,0.06)]" : "border-b border-[rgba(255,255,255,0.04)]"}>
      <div className="relative">
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-3 px-6 py-3 pr-12 text-sm hover:bg-white/[0.03] transition-colors cursor-pointer"
        >
          {isOpen
            ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          }
          {group.imageUrl ? (
            <img src={group.imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover border border-[rgba(255,255,255,0.08)] shrink-0" />
          ) : (
            <span className="w-14 h-14 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-muted-foreground" />
            </span>
          )}
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium leading-tight">{group.title}</span>
              {group.listings.some((l) => l.status === LISTING_STATUS.WITHDRAWAL_REQUESTED || l.status === LISTING_STATUS.PENDING_PICKUP) && (
                <span className="w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.5)] shrink-0" title="Withdrawal in progress" />
              )}
            </div>
            {group.brand && <div className="truncate text-[11px] text-muted-foreground leading-tight">{group.brand}</div>}
          </div>
          <span className="shrink-0 ml-auto text-xs text-muted-foreground tabular-nums mr-2">
            {group.listings.length} item{group.listings.length !== 1 ? "s" : ""}
          </span>
        </button>
        <Link
          to={`/portal/listings/new?productId=${group.productId}`}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
          title="Add another"
          onClick={(e) => e.stopPropagation()}
        >
          <Plus className="w-3.5 h-3.5" />
        </Link>
      </div>
      {isOpen && unpricedListings.length >= 2 && (
        <button
          onClick={() => setShowBulkModal(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-amber-300 bg-amber-400/10 hover:bg-amber-400/15 border-b border-amber-400/20 cursor-pointer transition-colors"
        >
          <DollarSign className="w-3.5 h-3.5" />
          Set price for all {unpricedListings.length} unpriced item{unpricedListings.length !== 1 ? "s" : ""}
        </button>
      )}
      {isOpen && activeListings.length >= 2 && onToggleSelectGroup && (
        <button
          onClick={() => onToggleSelectGroup(activeIds, !allSelectedInGroup)}
          className={`w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold border-b border-orange-400/20 cursor-pointer transition-colors ${allSelectedInGroup ? "text-orange-200 bg-orange-400/15 hover:bg-orange-400/20" : "text-orange-300 bg-orange-400/10 hover:bg-orange-400/15"}`}
        >
          {allSelectedInGroup ? `Unselect all ${activeListings.length}` : `Select all ${activeListings.length} active item${activeListings.length !== 1 ? "s" : ""}`}
        </button>
      )}
      {isOpen && (<>
        <div className="grid grid-cols-[28px_1fr_1.5fr_1.5fr_1.5fr_1fr_auto] px-6 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-[rgba(255,255,255,0.06)] bg-white/[0.02] items-center">
          <span />
          <span className="pl-2">Size</span>
          <span className="flex justify-center items-center gap-1">Your Price <InfoTip text="Click on a price to modify it" /></span>
          <span className="flex justify-center">Lowest</span>
          <span className="flex justify-center">Status</span>
          <span className="flex justify-center">Listed</span>
          <span className="w-14" />
        </div>
        {group.listings.map((listing, i) => {
          const selectable = listing.status === LISTING_STATUS.ACTIVE && onToggleSelect;
          const isSelected = !!(selectable && selectedIds?.has(listing.id));
          return (
          <div key={listing.id} className={`grid grid-cols-[28px_1fr_1.5fr_1.5fr_1.5fr_1fr_auto] px-6 py-2.5 text-sm items-center bg-white/[0.02] ${isSelected ? "bg-orange-400/[0.06]" : ""} ${i < group.listings.length - 1 ? "border-b border-[rgba(255,255,255,0.03)]" : ""}`}>
            {selectable ? (
              <button
                onClick={() => onToggleSelect!(listing.id)}
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${isSelected ? "bg-orange-400/30 border-orange-400/60" : "border-white/20 hover:border-white/40"}`}
                aria-label={isSelected ? "Unselect" : "Select for batch withdrawal"}
                aria-pressed={isSelected}
              >
                {isSelected && <span className="block w-1.5 h-1.5 rounded-sm bg-orange-300" />}
              </button>
            ) : (
              <span />
            )}
            <span className="pl-2 text-muted-foreground">{listing.variant.size}</span>
            <div className="flex justify-center">
              <InlinePrice
                listingId={listing.id}
                price={listing.price}
                editable={listing.status === LISTING_STATUS.ACTIVE || listing.status === LISTING_STATUS.APPROVED}
                awaitingPrice={listing.status === LISTING_STATUS.AWAITING_PRICE}
              />
            </div>
            <span className="flex justify-center text-xs text-muted-foreground tabular-nums">
              {lowestPrices[listing.variantId] != null ? `$${fmt(lowestPrices[listing.variantId])}` : "\u2014"}
            </span>
            <div className="flex justify-center"><StatusBadge status={listing.status} /></div>
            <span className="flex justify-center text-xs text-muted-foreground tabular-nums">
              {daysListedLabel(listing.listedAt ?? listing.createdAt, listing.status)}
            </span>
            <div className="w-14 flex justify-center gap-1">
              {listing.status === LISTING_STATUS.SUBMITTED && (
                <>
                  <Link to={`/portal/listings/${listing.id}/edit`} className="p-1 rounded hover:bg-white/[0.08] transition-colors text-muted-foreground hover:text-foreground" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </Link>
                  <button onClick={() => onConfirmDelete(listing.id)} className="p-1 rounded hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400 cursor-pointer" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {listing.status === LISTING_STATUS.AWAITING_PRICE && (
                <button onClick={() => onConfirmDelete(listing.id)} className="p-1 rounded hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400 cursor-pointer" title="Discard">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              {listing.status === LISTING_STATUS.ACTIVE && (
                <button onClick={() => onConfirmWithdraw(listing.id)} className="p-1 rounded hover:bg-orange-500/10 transition-colors text-muted-foreground hover:text-orange-400 cursor-pointer" title="Request Withdrawal">
                  <PackageX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          );
        })}
      </>)}
      {showBulkModal && (
        <BulkPriceModal
          count={unpricedListings.length}
          listingIds={unpricedListings.map((l) => l.id)}
          onClose={() => setShowBulkModal(false)}
        />
      )}
    </div>
  );
}
