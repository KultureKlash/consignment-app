import { useState } from "react";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

export interface StatsCardProps {
  label: string;
  value: string;
  trend?: string;
  icon: LucideIcon;
  color?: string; // accent color hex
}

type ColorTheme = {
  bg: string;
  iconBg: string;
  iconBorder: string;
  iconColor: string;
  accentBorder: string;
  glowColor: string;
  badgeBg: string;
  badgeColor: string;
  badgeDot: string;
};

function getTheme(color?: string): ColorTheme {
  switch (color) {
    case "green":
      return {
        bg: "#ffffff",
        iconBg: "#ecfdf5",
        iconBorder: "#a7f3d0",
        iconColor: "#059669",
        accentBorder: "#34d399",
        glowColor: "rgba(5,150,105,0.08)",
        badgeBg: "#ecfdf5",
        badgeColor: "#059669",
        badgeDot: "#10b981",
      };
    case "blue":
      return {
        bg: "#ffffff",
        iconBg: "#eff6ff",
        iconBorder: "#bfdbfe",
        iconColor: "#2563eb",
        accentBorder: "#60a5fa",
        glowColor: "rgba(37,99,235,0.08)",
        badgeBg: "#eff6ff",
        badgeColor: "#2563eb",
        badgeDot: "#3b82f6",
      };
    case "purple":
      return {
        bg: "#ffffff",
        iconBg: "#f5f3ff",
        iconBorder: "#c4b5fd",
        iconColor: "#7c3aed",
        accentBorder: "#a78bfa",
        glowColor: "rgba(124,58,237,0.08)",
        badgeBg: "#f5f3ff",
        badgeColor: "#7c3aed",
        badgeDot: "#8b5cf6",
      };
    case "amber":
      return {
        bg: "#ffffff",
        iconBg: "#fffbeb",
        iconBorder: "#fcd34d",
        iconColor: "#d97706",
        accentBorder: "#fbbf24",
        glowColor: "rgba(217,119,6,0.08)",
        badgeBg: "#fffbeb",
        badgeColor: "#d97706",
        badgeDot: "#f59e0b",
      };
    default:
      return {
        bg: "#ffffff",
        iconBg: "#f6f6f7",
        iconBorder: "#e3e3e3",
        iconColor: "#6d7175",
        accentBorder: "#9ca3af",
        glowColor: "rgba(0,0,0,0.04)",
        badgeBg: "#f6f6f7",
        badgeColor: "#6d7175",
        badgeDot: "#9ca3af",
      };
  }
}

export default function StatsCard({ label, value, trend, icon: Icon, color }: StatsCardProps) {
  const [hovered, setHovered] = useState(false);
  const t = getTheme(color);

  const card: React.CSSProperties = {
    background: t.bg,
    border: `1px solid ${hovered ? t.accentBorder : "#e3e3e3"}`,
    borderRadius: "12px",
    padding: "24px",
    boxShadow: hovered
      ? `0 4px 16px ${t.glowColor}, 0 1px 3px rgba(0,0,0,0.06)`
      : "0 1px 2px rgba(0,0,0,0.05)",
    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
    transform: hovered ? "translateY(-2px)" : "translateY(0)",
    cursor: "default",
  };

  const iconBox: React.CSSProperties = {
    padding: "10px",
    background: t.iconBg,
    borderRadius: "10px",
    border: `1px solid ${t.iconBorder}`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
    transform: hovered ? "scale(1.08)" : "scale(1)",
  };

  return (
    <div
      style={card}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={iconBox}>
          <Icon size={18} color={t.iconColor} />
        </div>
        <span style={{
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: t.badgeColor,
          background: t.badgeBg,
          padding: "3px 8px",
          borderRadius: "9999px",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
        }}>
          <span style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: t.badgeDot,
            animation: "pulse-dot 2s ease-in-out infinite",
          }} />
          Live
        </span>
      </div>
      <div>
        <p style={{ fontSize: "13px", fontWeight: 500, color: "#6d7175", marginBottom: "6px", letterSpacing: "0.01em" }}>{label}</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <h3 style={{
            fontSize: "26px",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "#1a1a1a",
            fontVariantNumeric: "tabular-nums",
            margin: 0,
            transition: "color 0.2s",
          }}>
            {value}
          </h3>
          {trend && (
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#059669", display: "flex", alignItems: "center" }}>
              <ArrowUpRight size={12} style={{ marginRight: "2px" }} />
              {trend}
            </span>
          )}
        </div>
      </div>
      {/* Accent bottom bar */}
      <div style={{
        marginTop: "16px",
        height: "3px",
        borderRadius: "3px",
        background: `linear-gradient(90deg, ${t.accentBorder}, transparent)`,
        opacity: hovered ? 1 : 0.3,
        transition: "opacity 0.3s ease",
      }} />
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
