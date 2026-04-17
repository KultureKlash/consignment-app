import { ArrowRight } from "lucide-react";

interface ActionItemProps {
  label: string;
  count: number;
  color: string;
  bgTint?: string;
  subtitle?: string;
}

export default function ActionItem({ label, count, color, bgTint, subtitle = "Requires review" }: ActionItemProps) {
  return (
    <button
      className={`w-full flex items-center justify-between py-3.5 px-4 rounded-xl border-none cursor-pointer transition-colors duration-150 font-[inherit] group ${bgTint ?? "bg-transparent"} hover:brightness-[0.97]`}
    >
      <div className="flex items-center gap-3.5">
        <div
          className="w-1.5 h-7 rounded-full shrink-0"
          style={{
            backgroundColor: color,
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
          style={{ color: count > 0 ? color : "#d1d5db" }}
        >
          {count}
        </span>
        <ArrowRight size={14} className="text-gray-300 transition-colors duration-150 group-hover:text-gray-400" />
      </div>
    </button>
  );
}
