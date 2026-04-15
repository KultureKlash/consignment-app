/** Single source of truth for listing status values.
 *  Import from here — never use raw status strings. */

export const LISTING_STATUS = {
  SUBMITTED: "submitted",
  APPROVED: "approved_awaiting_dropoff",
  ACTIVE: "active",
  PAUSED: "paused",
  PENDING_SALE: "pending_sale",
  SOLD: "sold",
  CANCELLED: "cancelled",
  REJECTED: "rejected",
  WITHDRAWAL_REQUESTED: "withdrawal_requested",
  PENDING_PICKUP: "pending_pickup",
  WITHDRAWN: "withdrawn",
} as const;

export type ListingStatus = (typeof LISTING_STATUS)[keyof typeof LISTING_STATUS];

// Semantic groups
export const TERMINAL_STATUSES: readonly ListingStatus[] = [
  LISTING_STATUS.SOLD,
  LISTING_STATUS.CANCELLED,
  LISTING_STATUS.REJECTED,
  LISTING_STATUS.WITHDRAWN,
];

export const ACTIVE_STATUSES: readonly ListingStatus[] = [
  LISTING_STATUS.ACTIVE,
  LISTING_STATUS.PENDING_SALE,
];

export const INACTIVE_STATUSES: readonly ListingStatus[] = [
  LISTING_STATUS.SOLD,
  LISTING_STATUS.CANCELLED,
  LISTING_STATUS.REJECTED,
  LISTING_STATUS.WITHDRAWAL_REQUESTED,
  LISTING_STATUS.PENDING_PICKUP,
  LISTING_STATUS.WITHDRAWN,
];

// Display labels
export const STATUS_LABELS: Record<string, string> = {
  [LISTING_STATUS.SUBMITTED]: "Submitted",
  [LISTING_STATUS.APPROVED]: "Approved",
  [LISTING_STATUS.ACTIVE]: "Active",
  [LISTING_STATUS.PENDING_SALE]: "Pending Sale",
  [LISTING_STATUS.SOLD]: "Sold",
  [LISTING_STATUS.CANCELLED]: "Deleted",
  [LISTING_STATUS.REJECTED]: "Rejected",
  [LISTING_STATUS.WITHDRAWAL_REQUESTED]: "Withdrawal Requested",
  [LISTING_STATUS.PENDING_PICKUP]: "Pending Pickup",
  [LISTING_STATUS.WITHDRAWN]: "Withdrawn",
};

// Colors for admin UI
export const STATUS_COLORS_ADMIN: Record<string, string> = {
  [LISTING_STATUS.ACTIVE]: "bg-primary",
  [LISTING_STATUS.PENDING_SALE]: "bg-[hsl(var(--warning))]",
  [LISTING_STATUS.SOLD]: "bg-[hsl(var(--success))]",
  [LISTING_STATUS.CANCELLED]: "bg-red-500/70",
  [LISTING_STATUS.WITHDRAWAL_REQUESTED]: "bg-orange-500/70",
  [LISTING_STATUS.PENDING_PICKUP]: "bg-cyan-500/70",
  [LISTING_STATUS.WITHDRAWN]: "bg-muted-foreground/70",
};
