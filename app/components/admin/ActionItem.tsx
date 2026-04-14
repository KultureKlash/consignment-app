import { ArrowRight } from "lucide-react";

interface ActionItemProps {
  label: string;
  count: number;
  color: string;
  subtitle?: string;
}

export default function ActionItem({ label, count, color, subtitle = "Requires review" }: ActionItemProps) {
  return (
    <button
      className="w-full flex items-center justify-between py-3.5 px-4 rounded-xl border-none bg-transparent hover:bg-black/[0.03] cursor-pointer transition-all duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] font-[inherit] group"
    >
      <div className="flex items-center gap-3.5">
        {/* Glowing line */}
        <div
          className="w-1 h-7 rounded-full shrink-0 transition-all duration-300 ease-in-out"
          style={{
            backgroundColor: color,
            boxShadow: count > 0 ? `0 0 8px ${color}80, 0 0 16px ${color}40` : "none",
            opacity: count > 0 ? 1 : 0.3,
          }}
        />
        <div className="text-left">
          <p className="text-[13px] font-semibold text-gray-900 m-0">{label}</p>
          <p className="text-[11px] text-slate-400 mt-0.5 mb-0">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <span
          className="text-base font-bold tabular-nums min-w-[20px] text-right"
          style={{
            color: count > 0 ? color : "#d1d5db",
            textShadow: count > 0 ? `0 0 12px ${color}30` : "none",
          }}
        >
          {count}
        </span>
        <ArrowRight
          size={14}
          className="text-gray-300 group-hover:translate-x-[3px] transition-all duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
        />
      </div>
    </button>
  );
}
