import { ArrowRight } from "lucide-react";
import { useState } from "react";

interface ActionItemProps {
  label: string;
  count: number;
  color: string;
  subtitle?: string;
}

export default function ActionItem({ label, count, color, subtitle = "Requires review" }: ActionItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 16px",
        borderRadius: "12px",
        border: "none",
        background: hovered ? `${color}08` : "transparent",
        cursor: "pointer",
        transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        fontFamily: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        {/* Glowing line */}
        <div style={{
          width: "4px",
          height: "28px",
          borderRadius: "9999px",
          background: color,
          boxShadow: count > 0
            ? `0 0 8px ${color}80, 0 0 16px ${color}40`
            : "none",
          opacity: count > 0 ? 1 : 0.3,
          transition: "all 0.3s ease",
          flexShrink: 0,
        }} />
        <div style={{ textAlign: "left" }}>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a", margin: 0 }}>{label}</p>
          <p style={{ fontSize: "11px", color: "#94a3b8", margin: "2px 0 0" }}>{subtitle}</p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{
          fontSize: "16px",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: count > 0 ? color : "#d1d5db",
          minWidth: "20px",
          textAlign: "right",
          textShadow: count > 0 ? `0 0 12px ${color}30` : "none",
        }}>
          {count}
        </span>
        <ArrowRight
          size={14}
          color={hovered ? color : "#d1d5db"}
          style={{
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            transform: hovered ? "translateX(3px)" : "translateX(0)",
          }}
        />
      </div>
    </button>
  );
}
