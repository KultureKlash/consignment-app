import { LISTING_STATUS } from "~/lib/listing-statuses";

// ── Tailwind class strings (used by payout section components) ──

export const sectionCardClass = "admin-card";
export const sectionHeaderClass = "admin-card-header";
export const sectionTitleClass = "admin-card-title";

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

export function statusBadgeClass(status: string): string {
  return `admin-badge capitalize whitespace-nowrap ${BADGE_CLASSES[status] ?? "admin-badge-cancelled"}`;
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
    [LISTING_STATUS.CANCELLED]: "deleted",
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