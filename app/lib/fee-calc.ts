/** Calculate consignment fee breakdown from a gross sale amount.
 *  Single source of truth — used by order processing and refunds. */
export function calculateFee(grossAmount: number, feeRate: number) {
  const feeAmount = Math.round(grossAmount * feeRate * 100) / 100;
  const consignorAmount = Math.round((grossAmount - feeAmount) * 100) / 100;
  return { feeAmount, consignorAmount };
}
