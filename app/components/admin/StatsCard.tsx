import { useState } from "react";
import type { LucideIcon } from "lucide-react";

export interface StatsCardProps {
  label: string;
  value: string;
  trend?: string;
  icon: LucideIcon;
  color?: string;
}

type ColorTheme = {
  iconBg: string;
  iconColor: string;
  accentGradient: string;
  hoverBorder: string;
  glowShadow: string;
};

function getTheme(color?: string): ColorTheme {
  switch (color) {
    case "green":
      return {
        iconBg: "linear-gradient(135deg, #064e3b, #065f46)",
        iconColor: "#ffffff",
        accentGradient: "linear-gradient(90deg, #065f46, #047857, transparent)",
        hoverBorder: "rgba(6, 95, 70, 0.35)",
        glowShadow: "0 8px 24px -4px rgba(6, 78, 59, 0.15), 0 2px 6px rgba(6, 78, 59, 0.08)",
      };
    case "blue":
      return {
        iconBg: "linear-gradient(135deg, #1e3a5f, #1e40af)",
        iconColor: "#ffffff",
        accentGradient: "linear-gradient(90deg, #1e40af, #2563eb, transparent)",
        hoverBorder: "rgba(30, 64, 175, 0.35)",
        glowShadow: "0 8px 24px -4px rgba(30, 58, 95, 0.15), 0 2px 6px rgba(30, 58, 95, 0.08)",
      };
    case "purple":
      return {
        iconBg: "linear-gradient(135deg, #3b0764, #5b21b6)",
        iconColor: "#ffffff",
        accentGradient: "linear-gradient(90deg, #5b21b6, #7c3aed, transparent)",
        hoverBorder: "rgba(91, 33, 182, 0.35)",
        glowShadow: "0 8px 24px -4px rgba(59, 7, 100, 0.15), 0 2px 6px rgba(59, 7, 100, 0.08)",
      };
    case "amber":
      return {
        iconBg: "linear-gradient(135deg, #78350f, #92400e)",
        iconColor: "#ffffff",
        accentGradient: "linear-gradient(90deg, #92400e, #b45309, transparent)",
        hoverBorder: "rgba(146, 64, 14, 0.35)",
        glowShadow: "0 8px 24px -4px rgba(120, 53, 15, 0.15), 0 2px 6px rgba(120, 53, 15, 0.08)",
      };
    default:
      return {
        iconBg: "linear-gradient(135deg, #1e293b, #334155)",
        iconColor: "#ffffff",
        accentGradient: "linear-gradient(90deg, #334155, #475569, transparent)",
        hoverBorder: "rgba(51, 65, 85, 0.35)",
        glowShadow: "0 8px 24px -4px rgba(0, 0, 0, 0.1), 0 2px 6px rgba(0, 0, 0, 0.05)",
      };
  }
}

export default function StatsCard({ label, value, trend, icon: Icon, color }: StatsCardProps) {
  const [hovered, setHovered] = useState(false);
  const t = getTheme(color);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: "#ffffff",
        border: `1px solid ${hovered ? t.hoverBorder : "rgba(0, 0, 0, 0.06)"}`,
        borderRadius: "14px",
        padding: "20px 22px",
        boxShadow: hovered
          ? t.glowShadow
          : "0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
        transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        cursor: "default",
        overflow: "hidden",
      }}
    >
      {/* Icon */}
      <div style={{
        width: "36px",
        height: "36px",
        borderRadius: "10px",
        background: t.iconBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: "14px",
        transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        transform: hovered ? "scale(1.08)" : "scale(1)",
      }}>
        <Icon size={17} color={t.iconColor} strokeWidth={2} />
      </div>

      {/* Label */}
      <p style={{
        fontSize: "12px",
        fontWeight: 500,
        color: "#8c9196",
        letterSpacing: "0.02em",
        margin: "0 0 4px",
      }}>
        {label}
      </p>

      {/* Value + Trend */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span style={{
          fontSize: "24px",
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: "#1a1a1a",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}>
          {value}
        </span>
        {trend && (
          <span style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "#059669",
            background: "#ecfdf5",
            padding: "2px 6px",
            borderRadius: "6px",
          }}>
            {trend}
          </span>
        )}
      </div>

      {/* Accent bar */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "3px",
        background: t.accentGradient,
        opacity: hovered ? 0.9 : 0.35,
        transition: "opacity 0.3s ease",
      }} />
    </div>
  );
}
