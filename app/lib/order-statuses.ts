/** Single source of truth for order, transaction, and consignor status values.
 *  Import from here — never use raw status strings. */

export const ORDER_STATUS = {
  OPEN: "open",
  FULFILLED: "fulfilled",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_PAYMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
} as const;

export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUS)[keyof typeof ORDER_PAYMENT_STATUS];

export const TRANSACTION_TYPE = {
  SALE: "sale",
  REFUND: "refund",
} as const;

export type TransactionType = (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

export const CONSIGNOR_STATUS = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
} as const;

export type ConsignorStatus = (typeof CONSIGNOR_STATUS)[keyof typeof CONSIGNOR_STATUS];
