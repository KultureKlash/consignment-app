import { useState, useRef, useEffect } from "react";
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

export default function DateRangeFilter({ preset, from, to, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<DateRange | undefined>(
    from && to ? { from: new Date(from + 'T12:00:00'), to: new Date(to + 'T12:00:00') } : undefined,
  );

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCalendar(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync range from props
  useEffect(() => {
    if (from && to) {
      setRange({ from: new Date(from + 'T12:00:00'), to: new Date(to + 'T12:00:00') });
    } else {
      setRange(undefined);
    }
  }, [from, to]);

  const activePreset = PRESETS.find((p) => p.value === preset);
  let displayLabel = activePreset?.label ?? "All time";
  if (preset === "custom" && from && to) {
    displayLabel = `${formatShort(new Date(from + 'T12:00:00'))} – ${formatShort(new Date(to + 'T12:00:00'))}`;
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
      onChange({
        dateRange: "custom",
        from: `${range.from.getFullYear()}-${String(range.from.getMonth() + 1).padStart(2, "0")}-${String(range.from.getDate()).padStart(2, "0")}`,
        to: `${range.to.getFullYear()}-${String(range.to.getMonth() + 1).padStart(2, "0")}-${String(range.to.getDate()).padStart(2, "0")}`,
      });
    }
  }

  return (
    <div ref={ref} className="relative flex-none">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setOpen(!open); if (!open) setShowCalendar(preset === "custom"); }}
        className="admin-input flex items-center gap-2 cursor-pointer whitespace-nowrap w-auto"
      >
        <Calendar size={15} className="text-gray-500" />
        <span>{displayLabel}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-[calc(100%+6px)] right-0 z-50 bg-white border border-gray-200/80 rounded-xl shadow-lg overflow-hidden flex">
          {/* Presets */}
          <div className={`py-2 min-w-[140px]${showCalendar ? " border-r border-gray-200/60" : ""}`}>
            {PRESETS.map((p) => (
              <div
                key={p.value}
                onClick={() => selectPreset(p.value)}
                className={`px-4 py-2 text-[13px] cursor-pointer transition-colors duration-100 hover:bg-gray-50 ${
                  p.value === preset
                    ? "font-semibold text-gray-900 bg-gray-100"
                    : "font-normal text-gray-500"
                }`}
              >
                {p.label}
              </div>
            ))}
          </div>

          {/* Calendar */}
          {showCalendar && (
            <div className="p-3">
              <DayPicker
                mode="range"
                selected={range}
                onSelect={setRange}
                disabled={{ after: new Date() }}
                numberOfMonths={1}
                style={{ fontSize: "13px" }}
              />
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-200/40">
                <button
                  type="button"
                  onClick={() => { setOpen(false); setShowCalendar(false); }}
                  className="admin-btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyRange}
                  disabled={!range?.from || !range?.to}
                  className="admin-btn-primary text-xs disabled:bg-gray-400 disabled:cursor-default disabled:hover:shadow-none disabled:hover:translate-y-0"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
