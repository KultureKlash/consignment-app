import { ChevronDown, ChevronRight, Clock, CheckCircle2, Download, Upload, FileText, RefreshCw, Loader2, Check, AlertCircle } from "lucide-react";
import { fmt } from "~/lib/currency";
import { computeTax } from "~/lib/tax";
import { PAYOUT_STATUS } from "~/lib/payout-statuses";

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    [PAYOUT_STATUS.PAID]: { label: "Paid", bg: "bg-[hsl(var(--success))]/15", text: "text-[hsl(var(--success))]" },
  };
  const c = config[status] ?? { label: status, bg: "bg-muted", text: "text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}`}>
      <CheckCircle2 className="w-3 h-3" />
      {c.label}
    </span>
  );
}

interface PaidHistoryProps {
  payouts: any[];
  consignor: any;
  isIndividual: boolean;
  expandedPayout: string | null;
  onTogglePayout: (id: string) => void;
  onDownload: () => void;
  // For business consignors: allow retroactive invoice upload on payouts that
  // were paid without invoice (admin override). Same upload mechanics as
  // ActivePayouts. Individual consignors never see these.
  isSubmitting?: boolean;
  onUploadInvoice?: (payoutId: string, file: File) => void;
  uploadingPayoutId?: string | null;
  recentlySavedPayoutId?: string | null;
}

export function PaidHistory({
  payouts,
  consignor,
  isIndividual,
  expandedPayout,
  onTogglePayout,
  onDownload,
  isSubmitting,
  onUploadInvoice,
  uploadingPayoutId,
  recentlySavedPayoutId,
}: PaidHistoryProps) {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "480ms" }}>
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
        <div>
          <h3 className="text-sm md:text-base font-semibold">Payout History</h3>
          <p className="text-xs text-muted-foreground">Completed payouts</p>
        </div>
        {payouts.length > 0 && (
          <button onClick={onDownload} title="Download PDF" className="p-1 text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer">
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {payouts.length === 0 ? (
        <div className="px-6 py-12 text-center text-muted-foreground text-sm">
          No completed payouts yet. Paid payouts will appear here.
        </div>
      ) : (
        <div className="divide-y divide-[rgba(255,255,255,0.06)]">
          {payouts.map((payout) => {
            const isOpen = expandedPayout === payout.id;
            return (
              <div key={payout.id}>
                <button
                  onClick={() => onTogglePayout(payout.id)}
                  className="w-full flex items-center gap-3 px-4 md:px-6 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <div className="flex-1 flex items-center justify-between min-w-0">
                    <div className="flex items-center gap-2 md:gap-3 min-w-0">
                      <StatusBadge status={PAYOUT_STATUS.PAID} />
                      {!isIndividual && !payout.invoiceSent && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-400/15 text-amber-300">
                          <AlertCircle className="w-2.5 h-2.5" />
                          Invoice pending
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground hidden md:inline">
                        {payout.items.length} item{payout.items.length !== 1 ? "s" : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(payout.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold tabular-nums">${fmt(payout.amount)}</span>
                      {!isIndividual && (() => {
                        const tax = computeTax(payout.amount, consignor);
                        return tax.isTaxable ? (
                          <div className="text-[10px] text-muted-foreground tabular-nums">${fmt(tax.total)} with tax</div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-[rgba(255,255,255,0.06)] bg-white/[0.02]">
                    {!isIndividual && onUploadInvoice && (() => {
                      const isUploading = uploadingPayoutId === payout.id;
                      const justSaved = recentlySavedPayoutId === payout.id;
                      // Three states: (1) no invoice yet → drop zone; (2) invoice
                      // present → filename + Replace; (3) actively uploading/saved.
                      if (!payout.invoiceSent) {
                        return (
                          <div className="px-6 md:px-10 py-4 border-b border-[rgba(255,255,255,0.06)]">
                            <label className={`flex flex-col items-center gap-2 py-4 px-4 rounded-xl border-2 border-dashed transition-all ${
                              isUploading
                                ? "border-blue-400/40 bg-white/[0.03] cursor-wait"
                                : justSaved
                                ? "border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/[0.05] cursor-default"
                                : "border-amber-400/40 hover:border-amber-400/60 hover:bg-white/[0.03] cursor-pointer"
                            }`}>
                              {isUploading ? (
                                <>
                                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                                  <span className="text-xs font-semibold text-muted-foreground">Uploading…</span>
                                </>
                              ) : justSaved ? (
                                <>
                                  <Check className="w-5 h-5 text-[hsl(var(--success))]" />
                                  <span className="text-xs font-semibold text-[hsl(var(--success))]">Uploaded</span>
                                </>
                              ) : (
                                <>
                                  <Upload className="w-5 h-5 text-amber-300" />
                                  <span className="text-xs font-semibold text-amber-200">Upload Invoice (PDF)</span>
                                  <span className="text-[10px] text-amber-200/70">You were paid without invoice — you can still send it. Max 5MB.</span>
                                </>
                              )}
                              <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                disabled={isSubmitting || isUploading}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  onUploadInvoice(payout.id, file);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          </div>
                        );
                      }
                      // Invoice present → small row with file name + Replace (Delete
                      // is blocked server-side for paid payouts; don't surface it).
                      return (
                        <div className="px-6 md:px-10 py-2.5 border-b border-[rgba(255,255,255,0.06)] flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{payout.invoiceFileName ?? "Invoice uploaded"}</span>
                          {isUploading ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-500/10 text-blue-400 shrink-0">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Uploading…
                            </span>
                          ) : justSaved ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] shrink-0">
                              <Check className="w-3 h-3" />
                              Uploaded
                            </span>
                          ) : (
                            <label
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
                              title="Replace this invoice"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Replace
                              <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                disabled={isSubmitting}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  onUploadInvoice(payout.id, file);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                          {/* No Delete — server blocks invoice removal once paid. */}
                        </div>
                      );
                    })()}
                    <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_90px] gap-2 px-10 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-[rgba(255,255,255,0.04)]">
                      <span>Product</span>
                      <span className="text-right">Sale</span>
                      <span className="text-right">Fee</span>
                      <span className="text-right">Payout</span>
                      <span className="text-right">Date</span>
                    </div>
                    {payout.items.map((pi: any) => {
                      const tx = pi.transaction;
                      const product = tx.orderItem?.listing?.variant?.product;
                      const variant = tx.orderItem?.listing?.variant;
                      return (
                        <div key={pi.id}>
                          <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_90px] gap-2 px-10 py-2.5 border-b border-[rgba(255,255,255,0.03)] text-sm">
                            <div className="min-w-0 truncate">
                              <span className="font-medium">{product?.title ?? "Unknown"}</span>
                              <span className="text-muted-foreground ml-1">({variant?.size ?? "?"})</span>
                            </div>
                            <span className="text-right tabular-nums text-muted-foreground">${fmt(tx.grossAmount)}</span>
                            <span className="text-right tabular-nums text-muted-foreground">${fmt(tx.feeAmount)}</span>
                            <span className="text-right tabular-nums font-medium text-[hsl(var(--success))]">${fmt(tx.consignorAmount)}</span>
                            <span className="text-right tabular-nums text-muted-foreground text-xs">
                              {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          </div>
                          <div className="md:hidden px-6 py-2.5 border-b border-[rgba(255,255,255,0.03)]">
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-sm font-medium truncate mr-2">{product?.title ?? "Unknown"}</span>
                              <span className="text-sm font-semibold tabular-nums text-[hsl(var(--success))] shrink-0">${fmt(tx.consignorAmount)}</span>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Size {variant?.size ?? "?"} · Fee ${fmt(tx.feeAmount)}</span>
                              <span>{new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Tax summary for business consignors */}
                    {!isIndividual && (() => {
                      const tax = computeTax(payout.amount, consignor);
                      if (!tax.isTaxable) return null;
                      return (
                        <div className="px-6 md:px-10 py-3 border-t border-[rgba(255,255,255,0.06)] bg-white/[0.03]">
                          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs tabular-nums">
                            <span className="text-muted-foreground">Subtotal <strong className="text-foreground">${fmt(tax.subtotal)}</strong></span>
                            {tax.gst > 0 && <span className="text-muted-foreground">GST (5%) <strong className="text-foreground">${fmt(tax.gst)}</strong></span>}
                            {tax.qst > 0 && <span className="text-muted-foreground">QST (9.975%) <strong className="text-foreground">${fmt(tax.qst)}</strong></span>}
                            {tax.hst > 0 && <span className="text-muted-foreground">{tax.taxLabel} <strong className="text-foreground">${fmt(tax.hst)}</strong></span>}
                            <span className="font-bold text-primary">Total Paid ${fmt(tax.total)}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
