import { ShoppingBag, CheckCircle2, Clock, Package } from "lucide-react";

interface ActivityItemProps {
  event: string;
  time: string;
  type: "sale" | "approval" | "request" | "listing";
}

const iconConfig: Record<string, { icon: typeof ShoppingBag; color: string; label: string }> = {
  sale: { icon: ShoppingBag, color: "#1a7f37", label: "Sale" },
  approval: { icon: CheckCircle2, color: "#2c6ecb", label: "Approval" },
  request: { icon: Clock, color: "#b86e00", label: "Update" },
  listing: { icon: Package, color: "#6d7175", label: "New Listing" },
};

const circle: React.CSSProperties = {
  width: "32px",
  height: "32px",
  borderRadius: "50%",
  background: "#f6f6f7",
  border: "1px solid #e3e3e3",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  marginTop: "2px",
};

export default function ActivityItem({ event, time, type }: ActivityItemProps) {
  const { icon: Icon, color, label } = iconConfig[type];

  return (
    <div style={{
      display: "flex",
      gap: "16px",
      padding: "12px 0",
      borderBottom: "1px solid rgba(227,227,227,0.5)",
    }}>
      <div style={circle}>
        <Icon size={14} color={color} />
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color, margin: "0 0 2px" }}>{label}</p>
        <p style={{ fontSize: "14px", color: "#1a1a1a", lineHeight: 1.5, fontWeight: 500, margin: 0 }}>{event}</p>
        <p style={{ fontSize: "12px", color: "rgba(109,113,117,0.6)", fontVariantNumeric: "tabular-nums", margin: "2px 0 0" }}>{time}</p>
      </div>
    </div>
  );
}
