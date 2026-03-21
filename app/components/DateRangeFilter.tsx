import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { Calendar } from "lucide-react";
import { handleFocus, handleBlurStyle } from "~/lib/listing-ui";

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
    from && to ? { from: new Date(from), to: new Date(to) } : undefined,
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
      setRange({ from: new Date(from), to: new Date(to) });
    } else {
      setRange(undefined);
    }
  }, [from, to]);

  const activePreset = PRESETS.find((p) => p.value === preset);
  let displayLabel = activePreset?.label ?? "All time";
  if (preset === "custom" && from && to) {
    displayLabel = `${formatShort(new Date(from))} – ${formatShort(new Date(to))}`;
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
        from: range.from.toISOString().slice(0, 10),
        to: range.to.toISOString().slice(0, 10),
      });
    }
  }

  return (
    <div ref={ref} style={{ position: "relative", flex: "0 0 auto" }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setOpen(!open); if (!open) setShowCalendar(preset === "custom"); }}
        onFocus={handleFocus as unknown as React.FocusEventHandler<HTMLButtonElement>}
        onBlur={handleBlurStyle as unknown as React.FocusEventHandler<HTMLButtonElement>}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 14px",
          fontSize: "14px",
          borderRadius: "8px",
          border: "1px solid #c4c9d1",
          background: "white",
          cursor: "pointer",
          fontFamily: "inherit",
          color: "#1a1a1a",
          transition: "border-color 0.2s, box-shadow 0.2s",
          outline: "none",
          whiteSpace: "nowrap",
        }}
      >
        <Calendar size={15} color="#6d7175" />
        <span>{displayLabel}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          zIndex: 50,
          background: "#fff",
          border: "1px solid rgba(227,227,227,0.8)",
          borderRadius: "10px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          overflow: "hidden",
          display: "flex",
        }}>
          {/* Presets */}
          <div style={{
            padding: "8px 0",
            minWidth: "140px",
            borderRight: showCalendar ? "1px solid rgba(227,227,227,0.6)" : "none",
          }}>
            {PRESETS.map((p) => (
              <div
                key={p.value}
                onClick={() => selectPreset(p.value)}
                style={{
                  padding: "9px 16px",
                  fontSize: "13px",
                  cursor: "pointer",
                  fontWeight: p.value === preset ? 600 : 400,
                  color: p.value === preset ? "#1a1a1a" : "#6d7175",
                  background: p.value === preset ? "#f3f4f6" : "transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (p.value !== preset) e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={(e) => { if (p.value !== preset) e.currentTarget.style.background = "transparent"; }}
              >
                {p.label}
              </div>
            ))}
          </div>

          {/* Calendar */}
          {showCalendar && (
            <div style={{ padding: "12px" }}>
              <DayPicker
                mode="range"
                selected={range}
                onSelect={setRange}
                disabled={{ after: new Date() }}
                numberOfMonths={1}
                style={{ fontSize: "13px" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "8px", borderTop: "1px solid rgba(227,227,227,0.4)" }}>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setShowCalendar(false); }}
                  style={{
                    padding: "6px 14px",
                    fontSize: "12px",
                    fontWeight: 600,
                    borderRadius: "10px",
                    border: "1px solid rgba(17,24,39,0.15)",
                    background: "rgba(17,24,39,0.06)",
                    color: "#111827",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyRange}
                  disabled={!range?.from || !range?.to}
                  style={{
                    padding: "6px 14px",
                    fontSize: "12px",
                    fontWeight: 600,
                    borderRadius: "10px",
                    border: "none",
                    background: range?.from && range?.to ? "#111827" : "#9ca3af",
                    color: "#fff",
                    cursor: range?.from && range?.to ? "pointer" : "default",
                    fontFamily: "inherit",
                  }}
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
