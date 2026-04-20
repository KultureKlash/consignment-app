/** Calculate consignment fee breakdown from a gross sale amount.
 *  Single source of truth — used by order processing and refunds.
 *  All math done in cents (integers) to avoid floating-point errors. */
export function calculateFee(grossAmount: number, feeRate: number) {
  const grossCents = Math.round(grossAmount * 100);
  const feeCents = Math.round(grossCents * feeRate);
  const consignorCents = grossCents - feeCents;
  return { feeAmount: feeCents / 100, consignorAmount: consignorCents / 100 };
}
