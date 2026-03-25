import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const tipWidth = 224; // w-56 = 14rem = 224px
    let left = rect.left + rect.width / 2 - tipWidth / 2;
    // Keep tooltip within viewport
    if (left < 8) left = 8;
    if (left + tipWidth > window.innerWidth - 8) left = window.innerWidth - 8 - tipWidth;
    setPos({ top: rect.top - 8, left });
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center w-[15px] h-[15px] md:w-[17px] md:h-[17px] rounded-full bg-amber-400/20 hover:bg-amber-400/35 transition-colors cursor-pointer select-none"
        aria-label="More info"
      >
        <span className="text-[10px] md:text-[11px] font-bold leading-none text-amber-300">i</span>
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <span
          style={{ top: pos.top, left: pos.left, transform: "translateY(-100%)" }}
          className="fixed max-w-56 w-max px-3.5 py-2.5 rounded-xl text-xs leading-relaxed text-foreground bg-[hsl(0,0%,14%)] border border-[rgba(255,255,255,0.12)] shadow-lg z-[9999] pointer-events-none"
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}
