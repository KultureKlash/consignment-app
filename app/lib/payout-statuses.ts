/** Single source of truth for payout status values.
 *  Import from here — never use raw status strings. */

export const PAYOUT_STATUS = {
  PENDING: "pending",
  INVOICED: "invoiced",
  PAID: "paid",
} as const;

export type PayoutStatus = (typeof PAYOUT_STATUS)[keyof typeof PAYOUT_STATUS];
