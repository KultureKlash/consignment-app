import { useState } from "react";
import { useFetcher } from "react-router";
import { DollarSign, PackageX, X } from "lucide-react";
import { WITHDRAWAL_FEE_PER_ITEM } from "~/lib/finance";
import { fmt } from "~/lib/currency";

interface PortalBulkActionBarProps {
  selectedIds: Set<string>;
  onClear: () => void;
}

type ModalKind = null | "withdraw" | "price";

export function PortalBulkActionBar({ selectedIds, onClear }: PortalBulkActionBarProps) {
  const fetcher = useFetcher();
  const [modal, setModal] = useState<ModalKind>(null);
  const [price, setPrice] = useState("");
  const count = selectedIds.size;
  const isSubmitting = fetcher.state !== "idle";
  const pickupFee = count * WITHDRAWAL_FEE_PER_ITEM;

  if (count === 0) return null;

  const handleWithdraw = () => {
    const listingIds = Array.from(selectedIds).join(",");
    fetcher.submit(
      { intent: "bulk-request-withdrawal", listingIds },
      { method: "POST" },
    );
    setModal(null);
    onClear();
  };

  const handleApplyPrice = () => {
    const parsed = parseFloat(price);
    if (isNaN(parsed) || parsed <= 0) return;
    const listingIds = Array.from(selectedIds).join(",");
    fetcher.submit(
      { intent: "bulk-update-price", listingIds, price: parsed.toFixed(2) },
      { method: "POST" },
    );
    setModal(null);
    setPrice("");
    onClear();
  };

  return (
    <>
      <div
        className="fixed left-1/2 -translate-x-1/2 bottom-5 z-40 glass-panel-strong glow-border rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-2 md:gap-3 animate-slide-up max-w-[calc(100vw-2rem)]"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={onClear}
          className="p-1 rounded-full hover:bg-white/[0.08] text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
          title="Clear selection"
          aria-label="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
          {count} selected
        </span>
        <button
          onClick={() => setModal("price")}
          disabled={isSubmitting}
          className="inline-flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-semibold bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <DollarSign className="w-4 h-4" />
          <span className="hidden sm:inline">Set price</span>
          <span className="sm:hidden">Price</span>
        </button>
        <button
          onClick={() => setModal("withdraw")}
          disabled={isSubmitting}
          className="inline-flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-semibold bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <PackageX className="w-4 h-4" />
          <span className="hidden sm:inline">{isSubmitting ? "Submitting..." : "Request withdrawal"}</span>
          <span className="sm:hidden">Withdraw</span>
        </button>
      </div>

      {modal === "withdraw" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setModal(null)}
        >
          <div
            className="glass-panel rounded-2xl p-6 w-[90%] max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-2">
              Withdraw {count} item{count !== 1 ? "s" : ""}?
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              {count === 1 ? "This item" : "These items"} will be taken off sale immediately. An admin will review the request and you'll be emailed when {count === 1 ? "it's" : "they're"} ready for pickup.
            </p>
            <div className="mb-5 px-3 py-2.5 rounded-xl bg-amber-400/10 border border-amber-400/20">
              <p className="text-xs font-semibold text-amber-200">
                {count} item{count !== 1 ? "s" : ""} × ${fmt(WITHDRAWAL_FEE_PER_ITEM)} = ${fmt(pickupFee)} due at pickup
              </p>
              <p className="text-[11px] text-amber-200/70 mt-0.5">
                Pay at the counter — card or cash.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/[0.06] hover:bg-white/[0.1] cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting..." : "Withdraw"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "price" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setModal(null)}
        >
          <div
            className="glass-panel rounded-2xl p-6 w-[90%] max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1">
              Set price for {count} item{count !== 1 ? "s" : ""}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              This price will be applied to every selected listing. Shopify will reflect the lowest active price per variant.
            </p>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") handleApplyPrice(); }}
                autoFocus
                placeholder="0.00"
                className="glass-input w-full pl-7 pr-3 py-2.5 rounded-xl text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/[0.06] hover:bg-white/[0.1] cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyPrice}
                disabled={isSubmitting || !price.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Applying..." : `Apply to ${count}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
