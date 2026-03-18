import { ArrowUpRight, type LucideIcon } from "lucide-react";

interface StatsCardProps {
  label: string;
  value: string;
  trend?: string;
  icon: LucideIcon;
}

const card: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e3e3e3",
  borderRadius: "12px",
  padding: "24px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  transition: "border-color 0.2s",
};

const iconBox: React.CSSProperties = {
  padding: "8px",
  background: "#f6f6f7",
  borderRadius: "8px",
  border: "1px solid #e3e3e3",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const liveBadge: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "rgba(109,113,117,0.6)",
};

export default function StatsCard({ label, value, trend, icon: Icon }: StatsCardProps) {
  return (
    <div
      style={card}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(109,113,117,0.3)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e3e3e3")}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={iconBox}>
          <Icon size={18} color="#6d7175" />
        </div>
        <span style={liveBadge}>Live</span>
      </div>
      <div>
        <p style={{ fontSize: "14px", fontWeight: 500, color: "#6d7175", marginBottom: "4px" }}>{label}</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <h3 style={{ fontSize: "24px", fontWeight: 600, letterSpacing: "-0.02em", color: "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>
            {value}
          </h3>
          {trend && (
            <span style={{ fontSize: "12px", fontWeight: 500, color: "#1a7f37", display: "flex", alignItems: "center" }}>
              <ArrowUpRight size={12} style={{ marginRight: "2px" }} />
              {trend}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
