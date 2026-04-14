import { LISTING_STATUS } from "~/lib/listing-statuses";
export { LISTING_STATUS };

export const ACTIVE_STATUSES = [LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.ACTIVE, LISTING_STATUS.PENDING_SALE];
export const INACTIVE_STATUSES = [LISTING_STATUS.SOLD, LISTING_STATUS.CANCELLED, LISTING_STATUS.REJECTED, LISTING_STATUS.WITHDRAWAL_REQUESTED, LISTING_STATUS.PENDING_PICKUP, LISTING_STATUS.WITHDRAWN];

export const STATUS_LABELS: Record<string, string> = {
  [LISTING_STATUS.SUBMITTED]: "Submitted",
  [LISTING_STATUS.APPROVED]: "Awaiting Drop-off",
  [LISTING_STATUS.ACTIVE]: "Active",
  [LISTING_STATUS.PENDING_SALE]: "Pending Sale",
  [LISTING_STATUS.SOLD]: "Sold",
  [LISTING_STATUS.CANCELLED]: "Cancelled",
  [LISTING_STATUS.REJECTED]: "Rejected",
  [LISTING_STATUS.WITHDRAWAL_REQUESTED]: "Withdrawing",
  [LISTING_STATUS.PENDING_PICKUP]: "Pickup Ready",
  [LISTING_STATUS.WITHDRAWN]: "Withdrawn",
};

export const STATUS_COLORS: Record<string, string> = {
  [LISTING_STATUS.SUBMITTED]: "bg-violet-500/15 text-violet-400",
  [LISTING_STATUS.APPROVED]: "bg-blue-400/15 text-blue-400",
  [LISTING_STATUS.ACTIVE]: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]",
  [LISTING_STATUS.PENDING_SALE]: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  [LISTING_STATUS.SOLD]: "bg-primary/15 text-primary",
  [LISTING_STATUS.CANCELLED]: "bg-muted-foreground/15 text-muted-foreground",
  [LISTING_STATUS.REJECTED]: "bg-red-500/15 text-red-400",
  [LISTING_STATUS.WITHDRAWAL_REQUESTED]: "bg-orange-500/15 text-orange-400",
  [LISTING_STATUS.PENDING_PICKUP]: "bg-cyan-500/15 text-cyan-400",
  [LISTING_STATUS.WITHDRAWN]: "bg-muted-foreground/15 text-muted-foreground",
};

// Status priority: lower = shown first. Active/in-process on top, final statuses at bottom.
export const STATUS_PRIORITY: Record<string, number> = {
  [LISTING_STATUS.ACTIVE]: 0,
  [LISTING_STATUS.PENDING_SALE]: 1,
  [LISTING_STATUS.SUBMITTED]: 2,
  [LISTING_STATUS.APPROVED]: 3,
  [LISTING_STATUS.WITHDRAWAL_REQUESTED]: 4,
  [LISTING_STATUS.PENDING_PICKUP]: 5,
  paused: 6,
  [LISTING_STATUS.REJECTED]: 7,
  [LISTING_STATUS.CANCELLED]: 8,
  [LISTING_STATUS.SOLD]: 9,
  [LISTING_STATUS.WITHDRAWN]: 10,
};

export const NOT_YET_LISTED = new Set([LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED]);

export const TABS = [
  { key: "all", label: "All", dotColor: "" },
  { key: LISTING_STATUS.ACTIVE, label: "Active", dotColor: "bg-[hsl(var(--success))]/60 shadow-[0_0_6px_hsl(152_60%_52%/0.4)]" },
  { key: LISTING_STATUS.SUBMITTED, label: "Pending", dotColor: "bg-amber-400/60 shadow-[0_0_6px_rgba(251,191,36,0.4)]" },
  { key: LISTING_STATUS.APPROVED, label: "Awaiting", dotColor: "bg-blue-400/60 shadow-[0_0_6px_rgba(96,165,250,0.4)]" },
  { key: "withdrawals", label: "Withdrawals", dotColor: "bg-orange-400/60 shadow-[0_0_6px_rgba(251,146,60,0.4)]" },
];

export type ListingRow = {
  id: string;
  price: number;
  status: string;
  createdAt: string | Date;
  variantId: string;
  variant: {
    size: string;
    gtin: string | null;
    product: { id: string; title: string; brand: string | null; imageUrl: string | null; sku: string | null };
  };
};

export type ProductGroup = {
  productId: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  listings: ListingRow[];
};

export function groupByProduct(listings: ListingRow[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();
  for (const l of listings) {
    const pid = l.variant.product.id;
    let group = map.get(pid);
    if (!group) {
      group = {
        productId: pid,
        title: l.variant.product.title,
        brand: l.variant.product.brand,
        imageUrl: l.variant.product.imageUrl,
        listings: [],
      };
      map.set(pid, group);
    }
    group.listings.push(l);
  }
  // Sort within each group: by status priority, then newest first
  for (const group of map.values()) {
    group.listings.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 99;
      const pb = STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }
  return Array.from(map.values());
}

export function daysListedLabel(createdAt: string | Date, status: string): string {
  if (NOT_YET_LISTED.has(status)) return "\u2014";
  const d = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
  return d === 0 ? "Today" : `${d}d`;
}
