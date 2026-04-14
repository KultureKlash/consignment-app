import { Link } from "react-router";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { TABS, ACTIVE_STATUSES } from "./helpers";

interface StatusTabsProps {
  statusFilter: string;
  statusCounts: Record<string, number>;
  showInactive: boolean;
  buildTabUrl: (tabKey: string) => string;
}

export function StatusTabs({ statusFilter, statusCounts, showInactive, buildTabUrl }: StatusTabsProps) {
  const activeCount = ACTIVE_STATUSES.reduce((s, k) => s + (statusCounts[k] ?? 0), 0);
  const totalCount = Object.values(statusCounts).reduce((s, c) => s + c, 0);

  return (
    <div className="animate-slide-up" style={{ animationDelay: "80ms" }}>
      <div className="glass-panel rounded-2xl p-1.5 flex items-center md:flex-1 overflow-x-auto glass-scrollbar">
        {TABS.map((tab) => {
          const isActive = statusFilter === tab.key || (tab.key === "all" && statusFilter === "all");
          const count = tab.key === "all" ? (showInactive ? totalCount : activeCount) : tab.key === "withdrawals" ? (statusCounts[LISTING_STATUS.WITHDRAWAL_REQUESTED] ?? 0) + (statusCounts[LISTING_STATUS.PENDING_PICKUP] ?? 0) : (statusCounts[tab.key] ?? 0);
          return (
            <Link key={tab.key} to={buildTabUrl(tab.key)} className={`shrink-0 md:shrink md:flex-1 px-2.5 md:px-0 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1 md:gap-1.5 cursor-pointer ${isActive ? "bg-white/[0.12] text-foreground shadow-[inset_0_0_12px_-4px_rgba(255,255,255,0.1)]" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"}`}>
              {tab.dotColor && <span className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full shrink-0 ${tab.dotColor}`} />}
              <span className="whitespace-nowrap">{tab.label}</span>
              {count > 0 && <span className={`text-[10px] tabular-nums rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1 shrink-0 ${isActive ? "bg-white/[0.12] text-foreground" : "bg-white/[0.06] text-muted-foreground"}`}>{count}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
