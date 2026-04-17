import { ShoppingBag, CheckCircle2, Clock, Package } from "lucide-react";

export interface ActivityItemProps {
  product: string;
  detail: string;
  size: string;
  price?: string;
  actor?: string;
  qty?: number;
  time: string;
  type: "sale" | "approval" | "request" | "listing";
}

const iconConfig: Record<string, { icon: typeof ShoppingBag; color: string; bg: string }> = {
  sale: { icon: ShoppingBag, color: "#065f46", bg: "bg-emerald-100/70" },
  approval: { icon: CheckCircle2, color: "#1e40af", bg: "bg-blue-100/70" },
  request: { icon: Clock, color: "#92400e", bg: "bg-amber-100/70" },
  listing: { icon: Package, color: "#334155", bg: "bg-slate-100" },
};

export default function ActivityItem({ product, detail, size, price, actor, qty, time, type }: ActivityItemProps) {
  const { icon: Icon, color, bg } = iconConfig[type];

  return (
    <div className="flex gap-3 py-3 border-b border-gray-100">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
        <Icon size={14} color={color} strokeWidth={2} />
      </div>
      <div className="flex flex-col min-w-0">
        <p className="text-[13px] text-gray-700 leading-normal m-0 overflow-hidden text-ellipsis">
          {actor && <span className="text-gray-400">{actor} </span>}
          {qty && qty > 1 && <span className="font-semibold text-gray-900">{qty}x </span>}
          <span className="font-semibold text-gray-900">{product}</span>
          <span className="text-gray-400"> ({size})</span>
          {" "}
          <span className="text-gray-500">{detail}</span>
          {price && (
            <span className="font-semibold" style={{ color }}> {price}</span>
          )}
        </p>
        <span className="text-[11px] text-gray-400 tabular-nums mt-0.5">
          {time}
        </span>
      </div>
    </div>
  );
}
