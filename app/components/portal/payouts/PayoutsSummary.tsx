import { CircleDot, Clock, CheckCircle2 } from "lucide-react";
import { InfoTip } from "~/components/portal/InfoTip";
import { fmt } from "~/lib/currency";

interface PayoutsSummaryProps {
  totalUnbatched: number;
  activeCount: number;
  totalPaid: number;
  isIndividual: boolean;
}

export function PayoutsSummary({ totalUnbatched, activeCount, totalPaid, isIndividual }: PayoutsSummaryProps) {
  const stats = [
    { label: "Unbatched", display: `$${fmt(totalUnbatched)}`, icon: CircleDot, color: "text-muted-foreground", tip: "Sales earnings not yet grouped into a payout by the admin." },
    { label: isIndividual ? "Pending" : "Awaiting Invoice", display: String(activeCount), icon: Clock, color: "text-[hsl(var(--warning))]", tip: isIndividual ? "Number of payouts being processed for payment." : "Number of payouts awaiting your invoice. Send your invoice so we can process payment." },
    { label: "Paid Out", display: `$${fmt(totalPaid)}`, icon: CheckCircle2, color: "text-[hsl(var(--success))]", tip: "Total amount that has been paid to you." },
  ];

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:grid grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={`stat-card animate-slide-up !p-6 ${stat.label === "Paid Out" ? "border-[hsl(var(--success))]/20" : ""}`}
            style={{
              animationDelay: `${i * 80}ms`,
              ...(stat.label === "Paid Out" ? { boxShadow: "0 0 30px -8px hsl(152 60% 52% / 0.12)" } : {}),
            }}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  {stat.label}
                  <InfoTip text={stat.tip} />
                </p>
                <p className="text-3xl font-bold mt-2 tracking-tight tabular-nums">{stat.display}</p>
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
            <p className="text-xl font-bold tracking-tight tabular-nums">{activeCount}</p>
            <Clock className="w-4 h-4 text-[hsl(var(--warning))]/60" />
          </div>
        </div>
      </div>
    </>
  );
}
