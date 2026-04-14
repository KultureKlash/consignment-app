import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { MapPin, Search } from "lucide-react";
import type { SectionOption } from "./types";

export function SectionPicker({ sections, value, onChange }: { sections: SectionOption[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const selectedName = sections.find((s) => s.id === value)?.name ?? null;
  const q = search.toLowerCase();

  // Group: Racks vs Shelves
  const racks = sections.filter((s) => s.name.startsWith("Rack ") && (!q || s.name.toLowerCase().includes(q)));
  const shelves = sections.filter((s) => /^[A-Z]\d+$/.test(s.name) && (!q || s.name.toLowerCase().includes(q)));
  const other = sections.filter((s) => !s.name.startsWith("Rack ") && !/^[A-Z]\d+$/.test(s.name) && (!q || s.name.toLowerCase().includes(q)));

  const pick = (id: string) => { onChange(id); setOpen(false); setSearch(""); };

  return (
    <span style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      {/* Badge trigger */}
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: "4px",
          fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px",
          border: `1px solid ${selectedName ? "rgba(5,150,105,0.3)" : "rgba(156,163,175,0.4)"}`,
          background: selectedName ? "rgba(5,150,105,0.08)" : "rgba(156,163,175,0.08)",
          color: selectedName ? "#059669" : "#9ca3af",
          cursor: "pointer", outline: "none", fontFamily: "inherit", whiteSpace: "nowrap",
        }}
      >
        <MapPin size={10} />
        {selectedName ?? "Section"}
      </button>

      {/* Popover via portal */}
      {open && typeof document !== "undefined" && createPortal(
        <div ref={popoverRef} style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", width: "240px",
          display: "flex", flexDirection: "column", maxHeight: "280px",
        }}>
          {/* Search — fixed top */}
          <div style={{ padding: "8px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sections..."
                style={{
                  width: "100%", padding: "6px 8px 6px 28px", fontSize: "12px", border: "1px solid #e5e7eb",
                  borderRadius: "6px", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div style={{ overflowY: "auto", scrollbarWidth: "none", flex: 1 }}>
            {/* Clear */}
            {value && (
              <div
                onClick={() => pick("")}
                style={{ padding: "6px 12px", fontSize: "11px", color: "#9ca3af", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
              >
                Clear section
              </div>
            )}

            {/* Racks */}
            {racks.length > 0 && (
              <>
                <div style={{ padding: "6px 12px 4px", fontSize: "9px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Clothing Racks
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", padding: "2px 10px 8px" }}>
                  {racks.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => pick(s.id)}
                      style={{
                        padding: "4px 10px", fontSize: "11px", fontWeight: 600, borderRadius: "6px",
                        border: `1px solid ${s.id === value ? "#059669" : "#e5e7eb"}`,
                        background: s.id === value ? "#ecfdf5" : "#fff",
                        color: s.id === value ? "#059669" : "#374151",
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Shelves — grid layout */}
            {shelves.length > 0 && (
              <>
                <div style={{ padding: "6px 12px 4px", fontSize: "9px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Shoe Storage
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "3px", padding: "2px 10px 8px" }}>
                  {shelves.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => pick(s.id)}
                      style={{
                        padding: "4px 0", fontSize: "11px", fontWeight: 500, borderRadius: "4px", textAlign: "center",
                        border: `1px solid ${s.id === value ? "#059669" : "#f3f4f6"}`,
                        background: s.id === value ? "#ecfdf5" : "#f9fafb",
                        color: s.id === value ? "#059669" : "#6b7280",
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Other */}
            {other.map((s) => (
              <div
                key={s.id}
                onClick={() => pick(s.id)}
                style={{
                  padding: "6px 12px", fontSize: "12px", cursor: "pointer",
                  fontWeight: s.id === value ? 600 : 400,
                  color: s.id === value ? "#059669" : "#374151",
                  background: s.id === value ? "#ecfdf5" : "",
                }}
                onMouseEnter={(e) => { if (s.id !== value) e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={(e) => { if (s.id !== value) e.currentTarget.style.background = ""; }}
              >
                {s.name}
              </div>
            ))}

            {racks.length === 0 && shelves.length === 0 && other.length === 0 && (
              <div style={{ padding: "12px", fontSize: "12px", color: "#9ca3af", textAlign: "center" }}>No sections match</div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
