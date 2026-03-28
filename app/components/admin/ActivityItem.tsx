import { ShoppingBag, CheckCircle2, Clock, Package } from "lucide-react";

interface ActivityItemProps {
  event: string;
  time: string;
  type: "sale" | "approval" | "request" | "listing";
}

const iconConfig: Record<string, { icon: typeof ShoppingBag; color: string; bg: string; label: string }> = {
  sale: { icon: ShoppingBag, color: "#065f46", bg: "#ecfdf5", label: "Sale" },
  approval: { icon: CheckCircle2, color: "#1e40af", bg: "#eff6ff", label: "Approval" },
  request: { icon: Clock, color: "#92400e", bg: "#fef3c7", label: "Update" },
  listing: { icon: Package, color: "#334155", bg: "#f1f5f9", label: "New Listing" },
};

export default function ActivityItem({ event, time, type }: ActivityItemProps) {
  const { icon: Icon, color, bg, label } = iconConfig[type];

  return (
    <div style={{
      display: "flex",
      gap: "14px",
      padding: "12px 0",
      borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
    }}>
      <div style={{
        width: "34px",
        height: "34px",
        borderRadius: "10px",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <Icon size={15} color={color} strokeWidth={2} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color,
          marginBottom: "2px",
        }}>
          {label}
        </span>
        <p style={{
          fontSize: "13px",
          color: "#1a1a1a",
          lineHeight: 1.5,
          fontWeight: 500,
          margin: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {event}
        </p>
        <span style={{
          fontSize: "11px",
          color: "#b5b9be",
          fontVariantNumeric: "tabular-nums",
          marginTop: "2px",
        }}>
          {time}
        </span>
      </div>
    </div>
  );
}
