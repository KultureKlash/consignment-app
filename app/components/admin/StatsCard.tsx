import type { LucideIcon } from "lucide-react";

export interface StatsCardProps {
  label: string;
  value: string;
  trend?: string;
  icon: LucideIcon;
  color?: string;
  tip?: string;
}

type ColorTheme = {
  iconBg: string;
  iconColor: string;
  accentLine: string;
};

function getTheme(color?: string): ColorTheme {
  switch (color) {
    case "green":
      return { iconBg: "bg-emerald-50", iconColor: "#059669", accentLine: "bg-emerald-600" };
    case "blue":
      return { iconBg: "bg-blue-50", iconColor: "#2563eb", accentLine: "bg-blue-600" };
    case "purple":
      return { iconBg: "bg-violet-50", iconColor: "#7c3aed", accentLine: "bg-violet-600" };
    case "amber":
      return { iconBg: "bg-amber-50", iconColor: "#d97706", accentLine: "bg-amber-600" };
    default:
      return { iconBg: "bg-slate-50", iconColor: "#64748b", accentLine: "bg-slate-500" };
  }
}

export default function StatsCard({ label, value, trend, icon: Icon, color, tip }: StatsCardProps) {
  const t = getTheme(color);

  return (
    <div
      className="relative bg-white rounded-2xl px-[22px] py-5 border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-default overflow-hidden group"
    >
      {/* Accent line — top */}
      <div className={`absolute top-0 left-5 right-5 h-0.5 ${t.accentLine} opacity-20 group-hover:opacity-60 transition-opacity duration-300 ease-in-out rounded-b-sm`} />

      {/* Top row: label + icon */}
      <div className="flex items-start justify-between mb-4">
        <p className="text-xs font-semibold text-slate-400 tracking-tight m-0 flex items-center gap-[5px]">
          {label}
          {tip && (
            <span title={tip} className="cursor-help inline-flex opacity-50">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <text x="8" y="11.5" textAnchor="middle" fontSize="10" fontWeight="600" fill="currentColor">i</text>
              </svg>
            </span>
          )}
        </p>
        <div className={`w-9 h-9 rounded-[10px] ${t.iconBg} flex items-center justify-center transition-transform duration-300 ease-in-out group-hover:scale-105`}>
          <Icon size={17} color={t.iconColor} strokeWidth={2} />
        </div>
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-2">
        <span className="text-[26px] font-bold tracking-tight text-gray-900 tabular-nums leading-none">
          {value}
        </span>
        {trend && (
          <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-[7px] py-0.5 rounded-md">
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
