// Shared Tailwind class strings and helpers for admin listing pages.
// Style objects are defined in admin.css — this file maps them to components.
import { LISTING_STATUS } from "~/lib/listing-statuses";

// ── Class strings (map to admin.css @layer components) ──

export const inputClass = "admin-input";
export const searchInputClass = "admin-input-search";
export const disabledInputClass = "admin-input-disabled";
export const labelClass = "admin-label";
export const chipClass = "admin-chip";
export const chipClearClass = "admin-chip-clear";
export const searchIconClass = "admin-search-icon";
export const thClass = "admin-th";
export const tdClass = "admin-td";
export const sectionCardClass = "admin-card";
export const sectionHeaderClass = "admin-card-header";
export const sectionTitleClass = "admin-card-title";
export const sectionBodyClass = "admin-card-body";

// ── Legacy style object exports (for gradual migration) ──
// Components still using style={{}} can import these until migrated.
// Delete each one as the consumer switches to className.

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  fontSize: "14px",
  borderRadius: "8px",
  border: "1px solid #c4c9d1",
  boxSizing: "border-box",
  fontFamily: "inherit",
  transition: "border-color 0.2s, box-shadow 0.2s",
  outline: "none",
  color: "#1a1a1a",
};

export const searchInputStyle: React.CSSProperties = {
  ...inputStyle,
  paddingLeft: "38px",
};

export const disabledInput: React.CSSProperties = {
  ...inputStyle,
  background: "#f9fafb",
  color: "#6b7280",
  cursor: "not-allowed",
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 500,
  marginBottom: "6px",
  color: "#374151",
};

export const chipStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px 14px",
  background: "#f0f4ff",
  border: "1px solid #c7d2fe",
  borderRadius: "8px",
  fontSize: "14px",
};

export const chipClear: React.CSSProperties = {
  cursor: "pointer",
  fontSize: "16px",
  color: "#6d7175",
  fontWeight: "bold",
  lineHeight: 1,
};

export const searchIconWrap: React.CSSProperties = {
  position: "absolute",
  left: "10px",
  top: "50%",
  transform: "translateY(-50%)",
  pointerEvents: "none",
  color: "#9ca3af",
};

export const thStyle: React.CSSProperties = {
  padding: "10px 8px",
  fontSize: "11px",
  fontWeight: 700,
  color: "#6d7175",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  textAlign: "left",
};

export const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  fontSize: "13px",
  color: "#1a1a1a",
  verticalAlign: "middle",
};

export const sectionCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #f0f0f0",
  borderRadius: "16px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  overflow: "hidden",
};

export const sectionHeader: React.CSSProperties = {
  padding: "16px 22px",
  borderBottom: "1px solid #f5f5f5",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

export const sectionTitle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: 0,
};

// ── Status badge ──

const BADGE_CLASSES: Record<string, string> = {
  [LISTING_STATUS.SUBMITTED]: "admin-badge-submitted",
  [LISTING_STATUS.APPROVED]: "admin-badge-approved",
  [LISTING_STATUS.ACTIVE]: "admin-badge-active",
  [LISTING_STATUS.PAUSED]: "admin-badge-paused",
  [LISTING_STATUS.PENDING_SALE]: "admin-badge-pending-sale",
  [LISTING_STATUS.SOLD]: "admin-badge-sold",
  [LISTING_STATUS.CANCELLED]: "admin-badge-cancelled",
  [LISTING_STATUS.REJECTED]: "admin-badge-rejected",
  [LISTING_STATUS.WITHDRAWAL_REQUESTED]: "admin-badge-withdrawal",
  [LISTING_STATUS.PENDING_PICKUP]: "admin-badge-pickup",
  [LISTING_STATUS.WITHDRAWN]: "admin-badge-withdrawn",
};

/** Returns Tailwind className for a status badge */
export function statusBadgeClass(status: string): string {
  return `admin-badge capitalize whitespace-nowrap ${BADGE_CLASSES[status] ?? "admin-badge-cancelled"}`;
}

/** Legacy: returns inline style object for status badge. Delete once all consumers use className. */
export const statusBadge = (status: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    submitted: { bg: "#ede9fe", text: "#7c3aed", border: "#c4b5fd" },
    approved_awaiting_dropoff: { bg: "#e0f7f6", text: "#0d9488", border: "#99f0e4" },
    active: { bg: "#e4f5e9", text: "#1a7f37", border: "#b7e4c7" },
    paused: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
    pending_sale: { bg: "#fff8e1", text: "#b86e00", border: "#ffe082" },
    sold: { bg: "#e8f4fd", text: "#2c6ecb", border: "#b3d9f2" },
    cancelled: { bg: "#f6f6f7", text: "#6d7175", border: "#e3e3e3" },
    rejected: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
    withdrawal_requested: { bg: "#fff7ed", text: "#ea580c", border: "#fed7aa" },
    pending_pickup: { bg: "#ecfeff", text: "#0891b2", border: "#a5f3fc" },
    withdrawn: { bg: "#f6f6f7", text: "#6d7175", border: "#e3e3e3" },
  };
  const c = colors[status] ?? colors.cancelled;
  return {
    display: "inline-block",
    padding: "2px 8px",
    fontSize: "11px",
    fontWeight: 600,
    borderRadius: "9999px",
    background: c.bg,
    color: c.text,
    border: `1px solid ${c.border}`,
    textTransform: "capitalize",
    whiteSpace: "nowrap",
  };
};

// ── Focus/blur handlers (legacy — use admin-input CSS class instead) ──

export function handleFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLDivElement>) {
  e.currentTarget.style.borderColor = "#111827";
  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(17,24,39,0.08)";
}

export function handleBlurStyle(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLDivElement>) {
  e.currentTarget.style.borderColor = "#c4c9d1";
  e.currentTarget.style.boxShadow = "none";
}

// ── Helpers ──

export function relativeTime(date: string | Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    [LISTING_STATUS.SUBMITTED]: "submitted",
    [LISTING_STATUS.APPROVED]: "awaiting drop-off",
    [LISTING_STATUS.ACTIVE]: "active",
    [LISTING_STATUS.PAUSED]: "paused",
    [LISTING_STATUS.PENDING_SALE]: "pending",
    [LISTING_STATUS.SOLD]: "sold",
    [LISTING_STATUS.CANCELLED]: "cancelled",
    [LISTING_STATUS.REJECTED]: "rejected",
    [LISTING_STATUS.WITHDRAWAL_REQUESTED]: "withdrawal",
    [LISTING_STATUS.PENDING_PICKUP]: "pickup",
    [LISTING_STATUS.WITHDRAWN]: "withdrawn",
  };
  return labels[status] ?? status;
}

// ── Types ──

export type ProductResult = {
  id: string;
  sku: string | null;
  title: string;
  brand: string | null;
  category: string | null;
  variants: Array<{ id: string; size: string; gtin: string }>;
};
