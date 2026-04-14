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
    <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
      {/* Badge trigger */}
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border cursor-pointer outline-none font-[inherit] whitespace-nowrap ${
          selectedName
            ? "border-emerald-600/30 bg-emerald-600/[0.08] text-emerald-600"
            : "border-gray-400/40 bg-gray-400/[0.08] text-gray-400"
        }`}
      >
        <MapPin size={10} />
        {selectedName ?? "Section"}
      </button>

      {/* Popover via portal */}
      {open && typeof document !== "undefined" && createPortal(
        <div ref={popoverRef} className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg w-60 flex flex-col max-h-[280px]" style={{ top: pos.top, left: pos.left }}>
          {/* Search — fixed top */}
          <div className="p-2 border-b border-gray-100 shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sections..."
                className="w-full py-1.5 pl-7 pr-2 text-xs border border-gray-200 rounded-md outline-none"
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "none" }}>
            {/* Clear */}
            {value && (
              <div
                onClick={() => pick("")}
                className="px-3 py-1.5 text-[11px] text-gray-400 cursor-pointer hover:bg-gray-50"
              >
                Clear section
              </div>
            )}

            {/* Racks */}
            {racks.length > 0 && (
              <>
                <div className="px-3 pt-1.5 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                  Clothing Racks
                </div>
                <div className="flex flex-wrap gap-1 px-2.5 pb-2 pt-0.5">
                  {racks.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => pick(s.id)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border cursor-pointer font-[inherit] ${
                        s.id === value
                          ? "border-emerald-600 bg-emerald-50 text-emerald-600"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
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
                <div className="px-3 pt-1.5 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                  Shoe Storage
                </div>
                <div className="grid grid-cols-5 gap-0.5 px-2.5 pb-2 pt-0.5">
                  {shelves.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => pick(s.id)}
                      className={`py-1 text-[11px] font-medium rounded text-center border cursor-pointer font-[inherit] ${
                        s.id === value
                          ? "border-emerald-600 bg-emerald-50 text-emerald-600"
                          : "border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100"
                      }`}
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
                className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 ${
                  s.id === value
                    ? "font-semibold text-emerald-600 bg-emerald-50"
                    : "font-normal text-gray-700"
                }`}
              >
                {s.name}
              </div>
            ))}

            {racks.length === 0 && shelves.length === 0 && other.length === 0 && (
              <div className="p-3 text-xs text-gray-400 text-center">No sections match</div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
