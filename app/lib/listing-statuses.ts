// Re-export from new location for backward compatibility
export {
  LISTING_STATUS,
  TERMINAL_STATUSES,
  ACTIVE_STATUSES,
  INACTIVE_STATUSES,
  STATUS_LABELS,
  STATUS_COLORS_ADMIN,
  LISTING_BUCKETS,
  BUCKET_LABELS,
} from "./domain/listing-statuses";
export type { ListingStatus, ListingBucket } from "./domain/listing-statuses";
