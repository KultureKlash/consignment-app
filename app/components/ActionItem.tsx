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
        padding: "16px",
        borderRadius: "8px",
        border: hovered ? "1px solid #e3e3e3" : "1px solid transparent",
        background: hovered ? "#f6f6f7" : "transparent",
        cursor: "pointer",
        transition: "all 0.2s",
        fontFamily: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ width: "6px", height: "32px", borderRadius: "9999px", background: color }} />
        <div style={{ textAlign: "left" }}>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", margin: 0 }}>{label}</p>
          <p style={{ fontSize: "12px", color: "#6d7175", margin: "2px 0 0" }}>{subtitle}</p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "14px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#1a1a1a" }}>{count}</span>
        <ArrowRight
          size={16}
          color={hovered ? "#6d7175" : "#e3e3e3"}
          style={{ transition: "all 0.2s", transform: hovered ? "translateX(2px)" : "none" }}
        />
      </div>
    </button>
  );
}
