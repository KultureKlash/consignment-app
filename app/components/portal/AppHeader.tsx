import { useState, useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import { Bell, ShoppingBag, CreditCard, CheckCircle, Truck, XCircle, PackageX, MapPin } from "lucide-react";
import type { PortalNotification } from "~/services/portal-dashboard.server";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function timeAgo(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const NOTIFICATION_ICONS: Record<string, typeof ShoppingBag> = {
  sale: ShoppingBag,
  payout: CreditCard,
  approved: CheckCircle,
  rejected: XCircle,
  dropoff: Truck,
  withdrawal_requested: PackageX,
  pickup_ready: MapPin,
  withdrawn: CheckCircle,
};

export function AppHeader({
  title,
  subtitle,
  consignorName,
  notifications,
}: {
  title: string;
  subtitle?: string;
  consignorName?: string;
  notifications?: { items: PortalNotification[]; unreadCount: number };
}) {
  const [bellOpen, setBellOpen] = useState(false);
  const [markedRead, setMarkedRead] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fetcher = useFetcher();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    if (bellOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [bellOpen]);

  const serverUnread = notifications?.unreadCount ?? 0;
  const unreadCount = markedRead ? 0 : serverUnread;
  const items = notifications?.items ?? [];

  function handleBellClick() {
    const opening = !bellOpen;
    setBellOpen(opening);
    if (opening && serverUnread > 0 && !markedRead) {
      setMarkedRead(true);
      fetcher.submit(null, { method: "POST", action: "/portal/api/notifications-read" });
    }
  }

  return (
    <div className="px-4 md:px-8 pt-6 md:pt-8 pb-6 md:pb-8 flex items-center justify-between">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-sm md:text-base text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>

      {consignorName && (
        <div className="flex items-center gap-2 md:gap-3">
          {/* Bell icon */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={handleBellClick}
              className="relative w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-white/[0.08]"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4 md:w-[18px] md:h-[18px] text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
              )}
            </button>

            {bellOpen && (
              <div className="fixed left-4 right-4 top-16 md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:w-80 glass-panel-strong glow-border rounded-xl overflow-hidden z-50 shadow-2xl animate-fade-in">
                <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.08)]">
                  <p className="text-sm font-semibold">Notifications</p>
                  <p className="text-[10px] text-muted-foreground">Recent activity</p>
                </div>
                {items.length === 0 ? (
                  <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No notifications
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto glass-scrollbar">
                    {items.map((notif) => {
                      const Icon = NOTIFICATION_ICONS[notif.type] ?? Bell;
                      return (
                        <div
                          key={notif.id}
                          className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors"
                        >
                          <div className={`w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 ${notif.color}`}>
                            <Icon className="w-3 h-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium">{notif.title}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{notif.description}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(notif.time)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile: initials only */}
          <div className="flex md:hidden w-8 h-8 rounded-full items-center justify-center text-xs font-bold glow-border"
            style={{ background: "hsl(0, 0%, 20%)", color: "hsl(0, 0%, 90%)" }}
          >
            {getInitials(consignorName)}
          </div>
          {/* Desktop: full pill */}
          <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-full glass-panel glow-border">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: "hsl(0, 0%, 20%)", color: "hsl(0, 0%, 90%)" }}
            >
              {getInitials(consignorName)}
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-foreground leading-tight">{consignorName}</div>
              <div className="text-[11px] text-muted-foreground leading-tight">Consignor</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
