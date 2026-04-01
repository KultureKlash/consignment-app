import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { Calendar } from "lucide-react";

type Preset = { label: string; value: string };

const PRESETS: Preset[] = [
  { label: "All time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Custom", value: "custom" },
];

type Props = {
  preset: string;
  from?: string;
  to?: string;
  onChange: (params: { dateRange: string; from?: string; to?: string }) => void;
};

function formatShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function DateRangePicker({ preset, from, to, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<DateRange | undefined>(
    from && to ? { from: new Date(from + "T12:00:00"), to: new Date(to + "T12:00:00") } : undefined,
  );
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Position dropdown below trigger
  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left });
  }, []);

  useEffect(() => {
    if (open) updatePos();
  }, [open, updatePos]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setShowCalendar(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (from && to) setRange({ from: new Date(from + "T12:00:00"), to: new Date(to + "T12:00:00") });
    else setRange(undefined);
  }, [from, to]);

  const activePreset = PRESETS.find((p) => p.value === preset);
  let displayLabel = activePreset?.label ?? "All time";
  if (preset === "custom" && from && to) {
    displayLabel = `${formatShort(new Date(from + "T12:00:00"))} – ${formatShort(new Date(to + "T12:00:00"))}`;
  }

  function selectPreset(value: string) {
    if (value === "custom") {
      setShowCalendar(true);
      return;
    }
    setShowCalendar(false);
    setOpen(false);
    onChange({ dateRange: value });
  }

  function applyRange() {
    if (range?.from && range?.to) {
      setOpen(false);
      setShowCalendar(false);
      // DayPicker creates dates at local midnight — use local getters
      const pad = (n: number) => String(n).padStart(2, "0");
      const f = range.from;
      const t = range.to;
      onChange({
        dateRange: "custom",
        from: `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}`,
        to: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`,
      });
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setOpen(!open); if (!open) setShowCalendar(preset === "custom"); }}
        className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 rounded-xl glass-input text-xs md:text-sm font-medium text-foreground cursor-pointer whitespace-nowrap transition-all duration-200"
      >
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        <span>{displayLabel}</span>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          className="fixed glass-panel-strong rounded-xl overflow-hidden flex shadow-2xl border border-white/[0.15]"
          style={{ top: pos.top, left: pos.left, zIndex: 9999 }}
        >
          {/* Presets */}
          <div className={`py-2 min-w-[130px] ${showCalendar ? "border-r border-white/[0.08]" : ""}`}>
            {PRESETS.map((p) => (
              <div
                key={p.value}
                onClick={() => selectPreset(p.value)}
                className={`px-4 py-2.5 text-xs md:text-sm cursor-pointer transition-colors ${
                  p.value === preset
                    ? "font-semibold text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
                }`}
              >
                {p.label}
              </div>
            ))}
          </div>

          {/* Calendar */}
          {showCalendar && (
            <div className="p-3 portal-calendar">
              <DayPicker
                mode="range"
                selected={range}
                onSelect={setRange}
                disabled={{ after: new Date() }}
                numberOfMonths={1}
                style={{ fontSize: "13px" }}
              />
              <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => { setOpen(false); setShowCalendar(false); }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/[0.06] border border-white/[0.1] text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyRange}
                  disabled={!range?.from || !range?.to}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground disabled:opacity-40 cursor-pointer disabled:cursor-default transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
