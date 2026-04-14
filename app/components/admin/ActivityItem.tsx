import { ShoppingBag, CheckCircle2, Clock, Package } from "lucide-react";

interface ActivityItemProps {
  event: string;
  time: string;
  type: "sale" | "approval" | "request" | "listing";
}

const iconConfig: Record<string, { icon: typeof ShoppingBag; color: string; bg: string; label: string }> = {
  sale: { icon: ShoppingBag, color: "#065f46", bg: "bg-emerald-50", label: "Sale" },
  approval: { icon: CheckCircle2, color: "#1e40af", bg: "bg-blue-50", label: "Approval" },
  request: { icon: Clock, color: "#92400e", bg: "bg-amber-100", label: "Update" },
  listing: { icon: Package, color: "#334155", bg: "bg-slate-100", label: "New Listing" },
};

export default function ActivityItem({ event, time, type }: ActivityItemProps) {
  const { icon: Icon, color, bg, label } = iconConfig[type];

  return (
    <div className="flex gap-3.5 py-3 border-b border-black/[0.04]">
      <div className={`w-[34px] h-[34px] rounded-[10px] ${bg} flex items-center justify-center shrink-0`}>
        <Icon size={15} color={color} strokeWidth={2} />
      </div>
      <div className="flex flex-col min-w-0">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.06em] mb-0.5"
          style={{ color }}
        >
          {label}
        </span>
        <p className="text-[13px] text-gray-900 leading-normal font-medium m-0 overflow-hidden text-ellipsis">
          {event}
        </p>
        <span className="text-[11px] text-gray-400 tabular-nums mt-0.5">
          {time}
        </span>
      </div>
    </div>
  );
}
