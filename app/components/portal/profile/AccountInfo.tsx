import { Link } from "react-router";
import { Settings, Percent, MessageSquare } from "lucide-react";

interface AccountInfoProps {
  feePercent: number;
  payoutPercent: number;
  memberSince: string;
}

export function AccountInfo({ feePercent, payoutPercent, memberSince }: AccountInfoProps) {
  return (
    <>
      {/* Commission info */}
      <div className="glass-panel rounded-2xl p-6 md:p-8 animate-slide-up" style={{ animationDelay: "120ms" }}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-white/[0.08] flex items-center justify-center">
            <Percent className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Commission</h2>
            <p className="text-xs text-muted-foreground">Your fee structure</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 glass-panel rounded-xl px-4 py-3.5">
          <div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Store Fee</div>
            <div className="text-lg font-bold tabular-nums">{feePercent}%</div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Your Payout</div>
            <div className="text-lg font-bold text-[hsl(var(--success))] tabular-nums">{payoutPercent}%</div>
          </div>
        </div>

        <div className="mt-6 px-4 py-4 rounded-xl bg-white/[0.03] border border-[rgba(255,255,255,0.06)]">
          <p className="text-xs text-muted-foreground leading-relaxed">
            For every sale, you receive <span className="text-foreground font-semibold">{payoutPercent}%</span> of the sale price.
            The remaining <span className="text-foreground font-semibold">{feePercent}%</span> is the store's commission.
            Contact admin to discuss your fee rate.
          </p>
        </div>
      </div>

      {/* Account info */}
      <div className="glass-panel rounded-2xl p-6 animate-slide-up" style={{ animationDelay: "200ms" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-white/[0.08] flex items-center justify-center">
            <Settings className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Account</h2>
            <p className="text-xs text-muted-foreground">Member since {memberSince}</p>
          </div>
        </div>

        <div className="text-xs text-muted-foreground leading-relaxed">
          For account changes, payouts, or any questions, reach out to the store team.
        </div>
        <Link
          to="/portal/feedback"
          className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-white/[0.06] border border-[rgba(255,255,255,0.08)] text-xs font-medium text-muted-foreground no-underline hover:bg-white/[0.1] hover:text-foreground transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Send Feedback
        </Link>
      </div>
    </>
  );
}
