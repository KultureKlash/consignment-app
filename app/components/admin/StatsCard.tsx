import { useState } from "react";
import type { LucideIcon } from "lucide-react";

export interface StatsCardProps {
  label: string;
  value: string;
  trend?: string;
  icon: LucideIcon;
  color?: string;
  tip?: string;
}

type ColorTheme = {
  iconBg: string;
  iconColor: string;
  accentLine: string;
};

function getTheme(color?: string): ColorTheme {
  switch (color) {
    case "green":
      return { iconBg: "#ecfdf5", iconColor: "#059669", accentLine: "#059669" };
    case "blue":
      return { iconBg: "#eff6ff", iconColor: "#2563eb", accentLine: "#2563eb" };
    case "purple":
      return { iconBg: "#f5f3ff", iconColor: "#7c3aed", accentLine: "#7c3aed" };
    case "amber":
      return { iconBg: "#fffbeb", iconColor: "#d97706", accentLine: "#d97706" };
    default:
      return { iconBg: "#f8fafc", iconColor: "#64748b", accentLine: "#64748b" };
  }
}

export default function StatsCard({ label, value, trend, icon: Icon, color, tip }: StatsCardProps) {
  const [hovered, setHovered] = useState(false);
  const t = getTheme(color);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: "#ffffff",
        borderRadius: "16px",
        padding: "20px 22px",
        border: "1px solid #f0f0f0",
        boxShadow: hovered
          ? "0 8px 30px rgba(0,0,0,0.08)"
          : "0 1px 3px rgba(0,0,0,0.04)",
        transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        cursor: "default",
        overflow: "hidden",
      }}
    >
      {/* Accent line — top */}
      <div style={{
        position: "absolute",
        top: 0, left: "20px", right: "20px",
        height: "2px",
        background: t.accentLine,
        opacity: hovered ? 0.6 : 0.2,
        transition: "opacity 0.3s ease",
        borderRadius: "0 0 2px 2px",
      }} />

      {/* Top row: label + icon */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
        <p style={{
          fontSize: "12px",
          fontWeight: 600,
          color: "#94a3b8",
          letterSpacing: "0.01em",
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: "5px",
        }}>
          {label}
          {tip && (
            <span title={tip} style={{ cursor: "help", display: "inline-flex", opacity: 0.5 }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <text x="8" y="11.5" textAnchor="middle" fontSize="10" fontWeight="600" fill="currentColor">i</text>
              </svg>
            </span>
          )}
        </p>
        <div style={{
          width: "36px",
          height: "36px",
          borderRadius: "10px",
          background: t.iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.3s ease",
          transform: hovered ? "scale(1.05)" : "scale(1)",
        }}>
          <Icon size={17} color={t.iconColor} strokeWidth={2} />
        </div>
      </div>

      {/* Value */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span style={{
          fontSize: "26px",
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: "#1a1a1a",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}>
          {value}
        </span>
        {trend && (
          <span style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "#059669",
            background: "#ecfdf5",
            padding: "2px 7px",
            borderRadius: "6px",
          }}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
