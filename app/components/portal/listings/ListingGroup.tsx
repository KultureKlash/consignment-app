import { Link } from "react-router";
import { Plus, Package, Trash2, Pencil, ChevronDown, ChevronRight, PackageX } from "lucide-react";
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
}: ListingGroupProps) {
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
              <img src={group.imageUrl} alt="" className="w-11 h-11 rounded-lg object-cover border border-[rgba(255,255,255,0.08)] shrink-0" />
            ) : (
              <span className="w-11 h-11 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
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
        {isOpen && group.listings.map((listing) => (
          <div key={listing.id} onClick={() => onMobileDetail?.(listing.id)} className="flex items-center gap-2 pl-8 pr-4 py-3 bg-white/[0.02] border-t border-[rgba(255,255,255,0.04)] cursor-pointer active:bg-white/[0.06] transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Size {listing.variant.size}</span>
                <span className="shrink-0 ml-2 text-sm font-bold tabular-nums">${fmt(listing.price)}</span>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {daysListedLabel(listing.createdAt, listing.status)}
                </span>
                <StatusBadge status={listing.status} />
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
          </div>
        ))}
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
            <img src={group.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover border border-[rgba(255,255,255,0.08)] shrink-0" />
          ) : (
            <span className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
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
      {isOpen && (<>
        <div className="grid grid-cols-[1fr_1.5fr_1.5fr_1.5fr_1fr_auto] px-6 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-[rgba(255,255,255,0.06)] bg-white/[0.02] items-center">
          <span className="pl-6">Size</span>
          <span className="flex justify-center items-center gap-1">Your Price <InfoTip text="Click on a price to modify it" /></span>
          <span className="flex justify-center">Lowest</span>
          <span className="flex justify-center">Status</span>
          <span className="flex justify-center">Listed</span>
          <span className="w-14" />
        </div>
        {group.listings.map((listing, i) => (
        <div key={listing.id} className={`grid grid-cols-[1fr_1.5fr_1.5fr_1.5fr_1fr_auto] px-6 py-2.5 text-sm items-center bg-white/[0.02] ${i < group.listings.length - 1 ? "border-b border-[rgba(255,255,255,0.03)]" : ""}`}>
          <span className="pl-6 text-muted-foreground">{listing.variant.size}</span>
          <div className="flex justify-center">
            <InlinePrice listingId={listing.id} price={listing.price} editable={listing.status === LISTING_STATUS.ACTIVE || listing.status === LISTING_STATUS.APPROVED} />
          </div>
          <span className="flex justify-center text-xs text-muted-foreground tabular-nums">
            {lowestPrices[listing.variantId] != null ? `$${fmt(lowestPrices[listing.variantId])}` : "\u2014"}
          </span>
          <div className="flex justify-center"><StatusBadge status={listing.status} /></div>
          <span className="flex justify-center text-xs text-muted-foreground tabular-nums">
            {daysListedLabel(listing.createdAt, listing.status)}
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
            {listing.status === LISTING_STATUS.ACTIVE && (
              <button onClick={() => onConfirmWithdraw(listing.id)} className="p-1 rounded hover:bg-orange-500/10 transition-colors text-muted-foreground hover:text-orange-400 cursor-pointer" title="Request Withdrawal">
                <PackageX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        ))}
      </>)}
    </div>
  );
}
