import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useRouteLoaderData, useFetcher } from "react-router";
import { redirect } from "react-router";
import { ChevronDown, ChevronRight, Clock, FileText, CheckCircle2, CircleDot, DollarSign, Send } from "lucide-react";
import { AppHeader } from "~/components/portal/AppHeader";
import { InfoTip } from "~/components/portal/InfoTip";
import { fmt } from "~/lib/currency";
import { authenticatePortal } from "~/services/portal-auth.server";
import { getConsignorPayouts } from "~/services/portal-dashboard.server";
import prisma from "~/db.server";
import type { loader as portalLoader } from "./portal";

export async function loader({ request }: LoaderFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");
  const data = await getConsignorPayouts(consignor.id, consignor.storeOwned);
  return { consignor, ...data };
}

export async function action({ request }: ActionFunctionArgs) {
  const { portalFormRateLimit } = await import("~/lib/rate-limit.server");
  const limited = portalFormRateLimit(request);
  if (limited) return limited;

  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "mark-invoice-sent") {
    const payoutId = formData.get("payoutId") as string;
    // Verify this payout belongs to the consignor
    const payout = await prisma.payout.findFirst({
      where: { id: payoutId, consignorId: consignor.id },
    });
    if (!payout) return { error: "Payout not found" };
    await prisma.payout.update({
      where: { id: payoutId },
      data: { invoiceSent: true },
    });
    return { ok: true };
  }

  return { error: "Invalid intent" };
}


function StatusBadge({ status, isIndividual }: { status: string; isIndividual?: boolean }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    pending: isIndividual
      ? { label: "Processing", bg: "bg-[hsl(var(--warning))]/15", text: "text-[hsl(var(--warning))]" }
      : { label: "Awaiting Invoice", bg: "bg-[hsl(var(--warning))]/15", text: "text-[hsl(var(--warning))]" },
    invoiced: { label: "Invoice Sent", bg: "bg-primary/15", text: "text-primary" },
    paid: { label: "Paid", bg: "bg-[hsl(var(--success))]/15", text: "text-[hsl(var(--success))]" },
  };
  const c = config[status] ?? { label: status, bg: "bg-muted", text: "text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}`}>
      {(status === "pending" || status === "invoiced") && <Clock className="w-3 h-3" />}
      {status === "paid" && <CheckCircle2 className="w-3 h-3" />}
      {c.label}
    </span>
  );
}

export default function PortalPayouts() {
  const loaderData = useLoaderData<typeof loader>();
  const { consignor, payouts, unbatchedTxs } = loaderData;
  const parentData = useRouteLoaderData<typeof portalLoader>("routes/portal");
  const fetcher = useFetcher();
  const [expandedPayout, setExpandedPayout] = useState<string | null>(null);
  const [showUnbatched, setShowUnbatched] = useState(false);
  const isSubmitting = ["loading", "submitting"].includes(fetcher.state);
  const storeOwned = (loaderData as Record<string, unknown>).storeOwned === true;

  if (storeOwned) {
    return (
      <div>
        <AppHeader
          title="Payouts"
          subtitle="Payout management"
          consignorName={consignor.name}
          avatarColor={parentData?.consignor?.avatarColor}
          notifications={parentData?.notifications}
        />
        <div className="px-4 md:px-8 pb-8">
          <div className="glass-panel rounded-2xl p-12 text-center">
            <DollarSign className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">Not applicable</p>
            <p className="text-sm text-muted-foreground">
              Payouts don't apply to store-owned inventory. View your profit on the Sales page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isIndividual = consignor.taxStatus !== "business";
  const activePayouts = payouts.filter((p) => p.status === "pending" || p.status === "invoiced");
  const paidPayouts = payouts.filter((p) => p.status === "paid");

  const totalActive = activePayouts.reduce((s, p) => s + p.amount, 0);
  const totalPaid = paidPayouts.reduce((s, p) => s + p.amount, 0);
  const totalUnbatched = unbatchedTxs.reduce((s, tx) => s + tx.consignorAmount, 0);

  return (
    <div>
      <AppHeader title="Payouts" subtitle="Track your earnings and payment status" consignorName={consignor.name} avatarColor={parentData?.consignor?.avatarColor} notifications={parentData?.notifications} />

      <div className="px-4 md:px-8 pb-8 space-y-4 md:space-y-6">
        {/* Legend */}
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 animate-slide-up">
          <span className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full bg-amber-400/20">
            <span className="text-[10px] font-bold leading-none text-amber-300">i</span>
          </span>
          Tap for info on what each term means
        </p>

        {/* Summary stats — Desktop: 3 equal cols, Mobile: 2 cols with Paid Out spanning 2 rows */}
        {/* Desktop */}
        <div className="hidden md:grid grid-cols-3 gap-4">
          {[
            { label: "Unbatched", display: `$${fmt(totalUnbatched)}`, icon: CircleDot, color: "text-muted-foreground", tip: "Sales earnings not yet grouped into a payout by the admin." },
            { label: isIndividual ? "Pending" : "Awaiting Invoice", display: String(activePayouts.length), icon: Clock, color: "text-[hsl(var(--warning))]", tip: isIndividual ? "Number of payouts being processed for payment." : "Number of payouts awaiting your invoice. Send your invoice so we can process payment." },
            { label: "Paid Out", display: `$${fmt(totalPaid)}`, icon: CheckCircle2, color: "text-[hsl(var(--success))]", tip: "Total amount that has been paid to you." },
          ].map((stat, i) => (
            <div key={stat.label} className="stat-card animate-slide-up !p-5" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    {stat.label}
                    <InfoTip text={stat.tip} />
                  </p>
                  <p className="text-2xl font-bold mt-1 tracking-tight tabular-nums">{stat.display}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.06)] flex items-center justify-center shrink-0">
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Mobile: 2-col grid, Paid Out hero card spans right column */}
        <div className="md:hidden grid grid-cols-[1fr_1.2fr] grid-rows-2 gap-3">
          {/* Unbatched — top left */}
          <div className="stat-card animate-slide-up !p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Unbatched</p>
              <InfoTip text="Sales earnings not yet grouped into a payout by the admin." />
            </div>
            <div className="flex items-end justify-between mt-auto pt-3">
              <p className="text-xl font-bold tracking-tight tabular-nums">${fmt(totalUnbatched)}</p>
              <CircleDot className="w-4 h-4 text-muted-foreground/50" />
            </div>
          </div>
          {/* Paid Out — right, hero card spanning 2 rows */}
          <div className="row-span-2 stat-card animate-slide-up !p-4 flex flex-col justify-between border-[hsl(var(--success))]/20" style={{ animationDelay: "160ms", boxShadow: "0 0 30px -8px hsl(152 60% 52% / 0.12)" }}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Paid Out</p>
              <InfoTip text="Total amount that has been paid to you." />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center py-4">
              <div className="w-10 h-10 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))]" />
              </div>
              <p className="text-3xl font-bold tracking-tight tabular-nums">${fmt(totalPaid)}</p>
            </div>
          </div>
          {/* Awaiting Invoice / Pending — bottom left */}
          <div className="stat-card animate-slide-up !p-4 flex flex-col justify-between" style={{ animationDelay: "80ms" }}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{isIndividual ? "Pending" : "Awaiting"}</p>
              <InfoTip text={isIndividual ? "Payouts being processed for payment." : "Payouts awaiting your invoice. Send your invoice so we can process payment."} />
            </div>
            <div className="flex items-end justify-between mt-auto pt-3">
              <p className="text-xl font-bold tracking-tight tabular-nums">{activePayouts.length}</p>
              <Clock className="w-4 h-4 text-[hsl(var(--warning))]/60" />
            </div>
          </div>
        </div>

        {/* Unbatched Sales */}
        {unbatchedTxs.length > 0 && (
          <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "320ms" }}>
            <button
              onClick={() => setShowUnbatched(!showUnbatched)}
              className="w-full flex items-center justify-between px-4 md:px-6 py-4 hover:bg-white/[0.03] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {showUnbatched ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                <div className="text-left">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">Unbatched Sales <InfoTip text="These are your earned commissions from sales that haven't been grouped into a payout yet. The admin will batch them when ready." /></h3>
                  <p className="text-xs text-muted-foreground">{unbatchedTxs.length} sale{unbatchedTxs.length !== 1 ? "s" : ""} not yet in a payout</p>
                </div>
              </div>
              <span className="text-sm font-bold tabular-nums">${fmt(totalUnbatched)}</span>
            </button>
            {showUnbatched && (
              <div className="border-t border-[rgba(255,255,255,0.08)]">
                {/* Mobile: card layout, Desktop: table */}
                <div className="hidden md:block">
                  <div className="grid grid-cols-[1fr_80px_80px_80px_90px] gap-2 px-6 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-[rgba(255,255,255,0.06)]">
                    <span>Product</span>
                    <span className="text-right">Sale</span>
                    <span className="text-right">Fee</span>
                    <span className="text-right">Payout</span>
                    <span className="text-right">Date</span>
                  </div>
                  {unbatchedTxs.map((tx) => (
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
                  {unbatchedTxs.map((tx) => (
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
        )}

        {/* Active Payouts (pending + invoiced) */}
        {activePayouts.length > 0 && (
          <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "400ms" }}>
            <div className="px-4 md:px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
              <h3 className="text-sm md:text-base font-semibold flex items-center gap-1.5">Active Payouts <InfoTip text={isIndividual ? "Payouts being processed. You'll be paid directly — no invoice needed." : "Payouts awaiting your invoice. Click 'Mark Invoice Sent' once you've sent it."} /></h3>
              <p className="text-xs text-muted-foreground">{activePayouts.length} payout{activePayouts.length !== 1 ? "s" : ""} in progress</p>
            </div>
            <div className="divide-y divide-[rgba(255,255,255,0.06)]">
              {activePayouts.map((payout) => {
                const isOpen = expandedPayout === payout.id;
                return (
                  <div key={payout.id}>
                    <button
                      onClick={() => setExpandedPayout(isOpen ? null : payout.id)}
                      className="w-full flex items-center gap-3 px-4 md:px-6 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <div className="flex-1 flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 md:gap-3 min-w-0">
                          <StatusBadge status={payout.status} isIndividual={isIndividual} />
                          {payout.status === "pending" && payout.invoiceSent && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary">
                              <Send className="w-2.5 h-2.5" />
                              Sent
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground hidden md:inline">
                            {payout.items.length} item{payout.items.length !== 1 ? "s" : ""}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(payout.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                        <span className="text-sm font-bold tabular-nums shrink-0">${fmt(payout.amount)}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-[rgba(255,255,255,0.06)] bg-white/[0.02]">
                        {/* Mark Invoice Sent for pending payouts — business consignors only */}
                        {!isIndividual && payout.status === "pending" && !payout.invoiceSent && (
                          <div className="px-6 md:px-10 py-3 border-b border-[rgba(255,255,255,0.06)]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                fetcher.submit(
                                  { intent: "mark-invoice-sent", payoutId: payout.id },
                                  { method: "POST" },
                                );
                              }}
                              disabled={isSubmitting}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary/15 text-primary hover:bg-primary/25 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Mark Invoice Sent
                            </button>
                            <p className="text-[10px] text-muted-foreground mt-1.5">Let us know you've sent your invoice so we can process it faster.</p>
                          </div>
                        )}
                        {!isIndividual && payout.status === "pending" && payout.invoiceSent && (
                          <div className="px-6 md:px-10 py-3 border-b border-[rgba(255,255,255,0.06)] flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs text-primary font-medium">Invoice marked as sent</span>
                          </div>
                        )}
                        <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_90px] gap-2 px-10 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-[rgba(255,255,255,0.04)]">
                          <span>Product</span>
                          <span className="text-right">Sale</span>
                          <span className="text-right">Fee</span>
                          <span className="text-right">Payout</span>
                          <span className="text-right">Date</span>
                        </div>
                        {payout.items.map((pi) => {
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Payout History (paid) */}
        <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "480ms" }}>
          <div className="px-4 md:px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
            <h3 className="text-sm md:text-base font-semibold">Payout History</h3>
            <p className="text-xs text-muted-foreground">Completed payouts</p>
          </div>

          {paidPayouts.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground text-sm">
              No completed payouts yet. Paid payouts will appear here.
            </div>
          ) : (
            <div className="divide-y divide-[rgba(255,255,255,0.06)]">
              {paidPayouts.map((payout) => {
                const isOpen = expandedPayout === payout.id;
                return (
                  <div key={payout.id}>
                    <button
                      onClick={() => setExpandedPayout(isOpen ? null : payout.id)}
                      className="w-full flex items-center gap-3 px-4 md:px-6 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <div className="flex-1 flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 md:gap-3 min-w-0">
                          <StatusBadge status="paid" />
                          <span className="text-xs text-muted-foreground hidden md:inline">
                            {payout.items.length} item{payout.items.length !== 1 ? "s" : ""}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(payout.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                        <span className="text-sm font-bold tabular-nums shrink-0">${fmt(payout.amount)}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-[rgba(255,255,255,0.06)] bg-white/[0.02]">
                        <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_90px] gap-2 px-10 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-[rgba(255,255,255,0.04)]">
                          <span>Product</span>
                          <span className="text-right">Sale</span>
                          <span className="text-right">Fee</span>
                          <span className="text-right">Payout</span>
                          <span className="text-right">Date</span>
                        </div>
                        {payout.items.map((pi) => {
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Empty state if nothing at all */}
        {payouts.length === 0 && unbatchedTxs.length === 0 && (
          <div className="glass-panel rounded-2xl p-12 text-center animate-slide-up" style={{ animationDelay: "320ms" }}>
            <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">No payouts or pending sales yet.</p>
            <p className="text-xs text-muted-foreground mt-1">When your items sell, payout details will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
