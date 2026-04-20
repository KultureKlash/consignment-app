import { ChevronDown, ChevronRight } from "lucide-react";
import { InfoTip } from "~/components/portal/InfoTip";
import { fmt } from "~/lib/currency";

interface UnbatchedSectionProps {
  transactions: any[];
  totalAmount: number;
  expanded: boolean;
  onToggle: () => void;
}

export function UnbatchedSection({ transactions, totalAmount, expanded, onToggle }: UnbatchedSectionProps) {
  if (transactions.length === 0) return null;

  return (
    <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "320ms" }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 md:px-6 py-4 hover:bg-white/[0.03] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <div className="text-left">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">Unbatched Sales <InfoTip text="These are your earned commissions from sales that haven't been grouped into a payout yet. The admin will batch them when ready." /></h3>
            <p className="text-xs text-muted-foreground">{transactions.length} sale{transactions.length !== 1 ? "s" : ""} not yet in a payout</p>
          </div>
        </div>
        <span className="text-sm font-bold tabular-nums">${fmt(totalAmount)}</span>
      </button>
      {expanded && (
        <div className="border-t border-[rgba(255,255,255,0.08)]">
          {/* Desktop: table */}
          <div className="hidden md:block">
            <div className="grid grid-cols-[1fr_80px_80px_80px_90px] gap-2 px-6 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-[rgba(255,255,255,0.06)]">
              <span>Product</span>
              <span className="text-right">Sale</span>
              <span className="text-right">Fee</span>
              <span className="text-right">Payout</span>
              <span className="text-right">Date</span>
            </div>
            {transactions.map((tx) => (
              <div key={tx.id} className="grid grid-cols-[1fr_80px_80px_80px_90px] gap-2 px-6 py-3 border-b border-[rgba(255,255,255,0.04)] text-sm">
                <div className="min-w-0 truncate">
                  <span className="font-medium">{tx.orderItem?.listing?.variant?.product?.title ?? "Unknown"}</span>
                  <span className="text-muted-foreground ml-1">({tx.orderItem?.listing?.variant?.size ?? "?"})</span>
                </div>
                <span className="text-right tabular-nums text-muted-foreground">${fmt(tx.grossAmount)}</span>
                <span className="text-right tabular-nums text-muted-foreground">${fmt(tx.feeAmount)}</span>
                <span className="text-right tabular-nums font-medium text-[hsl(var(--success))]">${fmt(tx.consignorAmount)}</span>
                <span className="text-right tabular-nums text-muted-foreground text-xs">
                  {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-[rgba(255,255,255,0.06)]">
            {transactions.map((tx) => (
              <div key={tx.id} className="px-4 py-3">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm font-medium truncate mr-2">{tx.orderItem?.listing?.variant?.product?.title ?? "Unknown"}</span>
                  <span className="text-sm font-semibold tabular-nums text-[hsl(var(--success))] shrink-0">${fmt(tx.consignorAmount)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Size {tx.orderItem?.listing?.variant?.size ?? "?"} · Fee ${fmt(tx.feeAmount)}</span>
                  <span>{new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
