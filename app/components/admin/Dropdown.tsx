import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type DropdownProps = {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  children: ReactNode;
  maxHeight?: number;
};

const containerStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 9999,
  background: "white",
  border: "1px solid #f0f0f0",
  borderRadius: "12px",
  maxHeight: "280px",
  overflowY: "auto",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.03)",
  scrollbarWidth: "none" as const,
  transition: "opacity 0.15s ease, transform 0.15s ease",
  padding: "4px 0",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

export default function Dropdown({ anchorRef, open, children, maxHeight }: DropdownProps) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !anchorRef.current) return;

    const update = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      setPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
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

  const content = (
    <div
      data-portal-dropdown
      style={{
        ...containerStyle,
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

// ── Shared dropdown item styles ──────────────────────────

export const dropdownItemStyle: React.CSSProperties = {
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: "13px",
  fontFamily: "inherit",
  borderRadius: "8px",
  margin: "2px 4px",
  transition: "background 0.12s ease",
};

export function handleItemHover(e: React.MouseEvent<HTMLDivElement>, enter: boolean) {
  e.currentTarget.style.background = enter ? "#f5f5f5" : "transparent";
}
