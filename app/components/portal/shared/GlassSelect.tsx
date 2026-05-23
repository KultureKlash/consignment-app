import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

type Option = { label: string; value: string; detail?: string };

export function GlassSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  icon,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => { setMounted(true); }, []);

  // Position the dropdown
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={`glass-input relative w-full py-2.5 rounded-xl text-sm text-left cursor-pointer flex items-center transition-colors ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        } ${icon ? "pl-10" : "pl-3"} pr-10`}
      >
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            {icon}
          </span>
        )}
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {mounted && open && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            zIndex: 9999,
            top: pos.top,
            left: pos.left,
            width: pos.width,
          }}
          className="glass-panel-strong glow-border rounded-xl overflow-hidden shadow-2xl animate-fade-in"
        >
          <div className="max-h-64 overflow-y-auto glass-scrollbar py-1">
            {options.map((opt) => {
              const isActive = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer flex items-center justify-between ${
                    isActive
                      ? "bg-[hsl(var(--cta))]/10 text-[hsl(var(--cta))]"
                      : "text-foreground hover:bg-white/[0.06]"
                  }`}
                >
                  <span>{opt.label}</span>
                  {opt.detail && (
                    <span className="text-[10px] text-muted-foreground tabular-nums ml-2">{opt.detail}</span>
                  )}
                </button>
              );
            })}
            {options.length === 0 && (
              <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                No options
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
