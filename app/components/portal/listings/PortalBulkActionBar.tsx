import { useState } from "react";
import { useFetcher } from "react-router";
import { PackageX, X } from "lucide-react";

interface PortalBulkActionBarProps {
  selectedIds: Set<string>;
  onClear: () => void;
}

export function PortalBulkActionBar({ selectedIds, onClear }: PortalBulkActionBarProps) {
  const fetcher = useFetcher();
  const [confirming, setConfirming] = useState(false);
  const count = selectedIds.size;
  const isSubmitting = fetcher.state !== "idle";

  if (count === 0) return null;

  const handleConfirm = () => {
    const listingIds = Array.from(selectedIds).join(",");
    fetcher.submit(
      { intent: "bulk-request-withdrawal", listingIds },
      { method: "POST" },
    );
    setConfirming(false);
    // Clear selection optimistically; route revalidation will refresh data
    onClear();
  };

  return (
    <>
      <div
        className="fixed left-1/2 -translate-x-1/2 bottom-5 z-40 glass-panel-strong glow-border rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 animate-slide-up"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={onClear}
          className="p-1 rounded-full hover:bg-white/[0.08] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Clear selection"
          aria-label="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {count} selected
        </span>
        <button
          onClick={() => setConfirming(true)}
          disabled={isSubmitting}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PackageX className="w-4 h-4" />
          {isSubmitting ? "Submitting..." : "Request withdrawal"}
        </button>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirming(false)}
        >
          <div
            className="glass-panel rounded-2xl p-6 w-[90%] max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-2">
              Withdraw {count} item{count !== 1 ? "s" : ""}?
            </h3>
            <p className="text-xs text-muted-foreground mb-5">
              {count === 1 ? "This item" : "These items"} will be taken off sale immediately. An admin will review the request and you'll be emailed when {count === 1 ? "it's" : "they're"} ready for pickup.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/[0.06] hover:bg-white/[0.1] cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting..." : "Withdraw"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
