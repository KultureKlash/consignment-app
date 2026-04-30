import { ChevronDown, ChevronRight, Clock, CheckCircle2, Upload, FileText, Trash2, RefreshCw, Loader2, Check } from "lucide-react";
import { InfoTip } from "~/components/portal/InfoTip";
import { fmt } from "~/lib/currency";
import { computeTax } from "~/lib/tax";
import { PAYOUT_STATUS } from "~/lib/payout-statuses";

function StatusBadge({ status, isIndividual }: { status: string; isIndividual?: boolean }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    [PAYOUT_STATUS.PENDING]: isIndividual
      ? { label: "Processing", bg: "bg-[hsl(var(--warning))]/15", text: "text-[hsl(var(--warning))]" }
      : { label: "Awaiting Invoice", bg: "bg-[hsl(var(--warning))]/15", text: "text-[hsl(var(--warning))]" },
    [PAYOUT_STATUS.INVOICED]: { label: "Invoice Sent", bg: "bg-primary/15", text: "text-primary" },
    [PAYOUT_STATUS.PAID]: { label: "Paid", bg: "bg-[hsl(var(--success))]/15", text: "text-[hsl(var(--success))]" },
  };
  const c = config[status] ?? { label: status, bg: "bg-muted", text: "text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}`}>
      {(status === PAYOUT_STATUS.PENDING || status === PAYOUT_STATUS.INVOICED) && <Clock className="w-3 h-3" />}
      {status === PAYOUT_STATUS.PAID && <CheckCircle2 className="w-3 h-3" />}
      {c.label}
    </span>
  );
}

interface ActivePayoutsProps {
  payouts: any[];
  consignor: any;
  isIndividual: boolean;
  expandedPayout: string | null;
  onTogglePayout: (id: string) => void;
  isSubmitting: boolean;
  onUploadInvoice: (payoutId: string, file: File) => void;
  onDeleteInvoice: (payoutId: string) => void;
  uploadingPayoutId: string | null;
  recentlySavedPayoutId: string | null;
}

export function ActivePayouts({
  payouts,
  consignor,
  isIndividual,
  expandedPayout,
  onTogglePayout,
  isSubmitting,
  onUploadInvoice,
  onDeleteInvoice,
  uploadingPayoutId,
  recentlySavedPayoutId,
}: ActivePayoutsProps) {
  if (payouts.length === 0) return null;

  return (
    <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "400ms" }}>
      <div className="px-4 md:px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
        <h3 className="text-sm md:text-base font-semibold flex items-center gap-1.5">Active Payouts <InfoTip text={isIndividual ? "Payouts being processed. You'll be paid directly — no invoice needed." : "Payouts awaiting your invoice. Click 'Mark Invoice Sent' once you've sent it."} /></h3>
        <p className="text-xs text-muted-foreground">{payouts.length} payout{payouts.length !== 1 ? "s" : ""} in progress</p>
      </div>
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
                    {payout.status === PAYOUT_STATUS.PENDING && payout.invoiceSent
                      ? <StatusBadge status={PAYOUT_STATUS.INVOICED} />
                      : <StatusBadge status={payout.status} isIndividual={isIndividual} />
                    }
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
                  {(() => {
                    const isUploading = uploadingPayoutId === payout.id;
                    const justSaved = recentlySavedPayoutId === payout.id;
                    return (
                      <>
                        {!isIndividual && payout.status === PAYOUT_STATUS.PENDING && !payout.invoiceSent && (
                          <div className="px-6 md:px-10 py-4 border-b border-[rgba(255,255,255,0.06)]">
                            <label className={`flex flex-col items-center gap-2 py-4 px-4 rounded-xl border-2 border-dashed transition-all ${
                              isUploading
                                ? "border-blue-400/40 bg-white/[0.03] cursor-wait"
                                : justSaved
                                ? "border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/[0.05] cursor-default"
                                : "border-[rgba(255,255,255,0.12)] hover:border-blue-400/40 hover:bg-white/[0.03] cursor-pointer"
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
                                  <Upload className="w-5 h-5 text-blue-400" />
                                  <span className="text-xs font-semibold text-muted-foreground">Upload Invoice (PDF)</span>
                                  <span className="text-[10px] text-muted-foreground/60">Max 5MB</span>
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
                                }}
                              />
                            </label>
                          </div>
                        )}
                        {!isIndividual && payout.invoiceSent && payout.invoiceFileName && (
                          <div className="px-6 md:px-10 py-2.5 border-b border-[rgba(255,255,255,0.06)] flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{payout.invoiceFileName}</span>
                            {isUploading ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-500/10 text-blue-400 shrink-0">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Saving…
                              </span>
                            ) : justSaved ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] shrink-0">
                                <Check className="w-3 h-3" />
                                Saved
                              </span>
                            ) : (
                              <>
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
                                <button
                                  type="button"
                                  onClick={() => onDeleteInvoice(payout.id)}
                                  disabled={isSubmitting}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                                  title="Delete this invoice"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </>
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
                        {/* Desktop row */}
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
                        {/* Mobile card */}
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
                          <span className="font-bold text-primary">Total Payable ${fmt(tax.total)}</span>
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
    </div>
  );
}
