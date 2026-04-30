import { createPortal } from "react-dom";
import { Link } from "react-router";
import { Plus, Package, Trash2, Pencil, ChevronRight, PackageX, ArrowLeft } from "lucide-react";
import { fmt } from "~/lib/currency";
import { StatusBadge } from "./StatusBadge";
import { InlinePrice } from "./InlinePrice";
import { daysListedLabel, LISTING_STATUS } from "./listingHelpers";
import type { ListingRow } from "./listingHelpers";

interface MobileDetailDrawerProps {
  listing: ListingRow;
  lowestPrices: Record<string, number>;
  onClose: () => void;
  onConfirmDelete: (listingId: string) => void;
  onConfirmWithdraw: (listingId: string) => void;
}

export function MobileDetailDrawer({
  listing,
  lowestPrices,
  onClose,
  onConfirmDelete,
  onConfirmWithdraw,
}: MobileDetailDrawerProps) {
  if (typeof document === "undefined") return null;

  const product = listing.variant.product;
  const lowest = lowestPrices[listing.variantId];
  const daysLabel = daysListedLabel(listing.createdAt, listing.status);
  const sku = listing.variant.gtin || product.sku || null;
  const isEditable = listing.status === LISTING_STATUS.ACTIVE || listing.status === LISTING_STATUS.APPROVED;
  const isAwaitingPrice = listing.status === LISTING_STATUS.AWAITING_PRICE;

  return createPortal(
    <div className="fixed inset-0 z-[200] md:hidden" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />

      {/* Drawer */}
      <div
        className="absolute inset-0 overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-full px-4 pt-3 pb-28">
          {/* Back button */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 py-3 text-sm text-muted-foreground cursor-pointer mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          {/* Main card */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            {/* Product image */}
            <div className="p-5 pb-0">
              {product.imageUrl ? (
                <div className="w-full aspect-[4/3] rounded-xl bg-white/[0.04] flex items-center justify-center overflow-hidden">
                  <img
                    src={product.imageUrl}
                    alt={product.title}
                    className="max-h-full max-w-full object-contain p-3"
                  />
                </div>
              ) : (
                <div className="w-full aspect-[4/3] rounded-xl bg-white/[0.04] flex items-center justify-center">
                  <Package className="w-14 h-14 text-muted-foreground/20" />
                </div>
              )}
            </div>

            {/* Title + status */}
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-foreground leading-tight">{product.title}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Size {listing.variant.size}</p>
                </div>
                {!isAwaitingPrice && <StatusBadge status={listing.status} />}
              </div>
            </div>

            {/* Price + lowest */}
            <div className="px-5 pb-4">
              <div className="flex items-baseline justify-between">
                {isAwaitingPrice ? (
                  <InlinePrice listingId={listing.id} price={null} editable={false} awaitingPrice />
                ) : (
                  <span className="text-2xl font-bold tabular-nums text-foreground">{listing.price != null ? `$${fmt(listing.price)}` : "—"}</span>
                )}
                {lowest != null && (
                  <button className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                    Lowest Ask <span className="text-foreground font-medium">${fmt(lowest)}</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Details rows */}
            <div className="border-t border-white/[0.06]">
              <div className="flex justify-between items-center px-5 py-3.5 border-b border-white/[0.04]">
                <span className="text-sm text-muted-foreground">Days Listed</span>
                <span className="text-sm font-semibold text-foreground tabular-nums">{daysLabel}</span>
              </div>
              {sku && (
                <div className="flex justify-between items-center px-5 py-3.5">
                  <span className="text-sm text-muted-foreground">SKU / GTIN</span>
                  <span className="text-sm font-semibold text-foreground font-mono tabular-nums">{sku}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-5 pt-4 space-y-2.5 border-t border-white/[0.06]">
              {isEditable && (
                <div className="flex items-center justify-center gap-2.5 w-full py-2 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm font-semibold text-foreground">
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                  <InlinePrice listingId={listing.id} price={listing.price} editable />
                </div>
              )}
              <Link
                to={`/portal/listings/new?productId=${product.id}`}
                className="flex items-center justify-center gap-2.5 w-full py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm font-semibold text-foreground hover:bg-white/[0.1] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Quantity
              </Link>
              {listing.status === LISTING_STATUS.ACTIVE && (
                <button
                  onClick={() => { onClose(); onConfirmWithdraw(listing.id); }}
                  className="flex items-center justify-center gap-2.5 w-full py-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-sm font-semibold text-orange-400 hover:bg-orange-500/20 transition-colors cursor-pointer"
                >
                  <PackageX className="w-4 h-4" />
                  Request Withdrawal
                </button>
              )}
              {listing.status === LISTING_STATUS.SUBMITTED && (
                <>
                  <Link
                    to={`/portal/listings/${listing.id}/edit`}
                    className="flex items-center justify-center gap-2.5 w-full py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm font-semibold text-foreground hover:bg-white/[0.1] transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit Listing
                  </Link>
                  <button
                    onClick={() => { onClose(); onConfirmDelete(listing.id); }}
                    className="flex items-center justify-center gap-2.5 w-full py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Listing
                  </button>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>,
    document.body,
  );
}
