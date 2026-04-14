import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type DropdownProps = {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  children: ReactNode;
  maxHeight?: number;
};

export default function Dropdown({ anchorRef, open, children, maxHeight }: DropdownProps) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open || !anchorRef.current) return;

    const update = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef]);

  if (!mounted || !open) return null;

  // Position is dynamic (depends on anchor element), so inline style needed for top/left/width
  const content = (
    <div
      data-portal-dropdown
      className="fixed z-[9999] bg-white border border-gray-100 rounded-xl max-h-72 overflow-y-auto shadow-xl py-1 font-[inherit] transition-all duration-150 scrollbar-none"
      style={{
        top: pos.top,
        left: pos.left,
        minWidth: Math.max(pos.width, 180),
        ...(maxHeight ? { maxHeight } : {}),
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0)" : "translateY(-4px)",
      }}
    >
      {children}
    </div>
  );

  return createPortal(content, document.body);
}

// ── Shared dropdown item class ──
export const dropdownItemClass = "admin-dropdown-item px-3.5 py-2 text-sm font-[inherit] rounded-lg mx-1";
