import { ShoppingBag, CheckCircle2, Clock, Package } from "lucide-react";

interface ActivityItemProps {
  event: string;
  time: string;
  type: "sale" | "approval" | "request" | "listing";
}

const iconConfig: Record<string, { icon: typeof ShoppingBag; color: string }> = {
  sale: { icon: ShoppingBag, color: "#1a7f37" },
  approval: { icon: CheckCircle2, color: "#2c6ecb" },
  request: { icon: Clock, color: "#b86e00" },
  listing: { icon: Package, color: "#6d7175" },
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
  const { icon: Icon, color } = iconConfig[type];

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
        <p style={{ fontSize: "14px", color: "#1a1a1a", lineHeight: 1.5, fontWeight: 500, margin: 0 }}>{event}</p>
        <p style={{ fontSize: "12px", color: "rgba(109,113,117,0.6)", fontVariantNumeric: "tabular-nums", margin: "2px 0 0" }}>{time}</p>
      </div>
    </div>
  );
}
