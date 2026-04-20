// Re-export from new location for backward compatibility
export {
  ORDER_STATUS,
  ORDER_PAYMENT_STATUS,
  TRANSACTION_TYPE,
  CONSIGNOR_STATUS,
} from "./domain/order-statuses";
export type {
  OrderStatus,
  OrderPaymentStatus,
  TransactionType,
  ConsignorStatus,
} from "./domain/order-statuses";
