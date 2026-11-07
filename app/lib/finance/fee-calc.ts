import { Prisma } from "@prisma/client";

/**
 * Money helpers. Every money column is `numeric(10,2)` and reaches us as a
 * `Prisma.Decimal`; this module is the only place that converts between a
 * Decimal and a number, and the only place money is rounded.
 */

/** Accepts anything a money column or a caller can hand us. */
export type MoneyInput = Prisma.Decimal | number | string;

export function toDecimal(value: MoneyInput): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/**
 * Round to cents. The single rounding site for money.
 *
 * Named roundMoney, not round2: tax.ts has a private number-returning round2 for
 * tax display, and two same-named rounding helpers with different return types
 * is exactly the confusion this migration exists to remove.
 *
 * ROUND_HALF_UP matches what `Math.round` did before this migration, so no
 * existing amount changes value. Decimal.js defaults to ROUND_HALF_UP, but it is
 * stated explicitly because the default is configurable process-wide and a
 * silent change here would silently re-round every fee.
 */
export function roundMoney(value: MoneyInput): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export const ZERO = new Prisma.Decimal(0);

/** Sum money exactly. Replaces `arr.reduce((s, x) => s + x, 0)` on the server. */
export function sumMoney(values: MoneyInput[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => acc.plus(toDecimal(v)), ZERO);
}

/**
 * Calculate the consignment fee breakdown from a gross sale amount.
 *
 * Single source of truth — used by order processing and refunds.
 *
 * Still computes in integer cents. `feeRate` is a Float by design (see the note
 * on Consignor.feeRate in schema.prisma), so the multiply happens on an integer
 * cent count rather than on a Decimal, which keeps one deterministic rounding
 * step instead of mixing Decimal and float arithmetic.
 *
 * The consignor side is derived by subtraction, so `feeAmount + consignorAmount`
 * reconstructs `grossAmount` exactly for any rate. That identity is asserted per
 * transaction by scripts/sim/10-reconcile-shopify.ts.
 */
export function calculateFee(
  grossAmount: MoneyInput,
  feeRate: number,
): { feeAmount: Prisma.Decimal; consignorAmount: Prisma.Decimal } {
  // Gross is already at most 2dp coming out of numeric(10,2); roundMoney guards
  // the case where a caller passes an unrounded number.
  const grossCents = roundMoney(grossAmount).times(100).toNumber();
  const feeCents = Math.round(grossCents * feeRate);
  const consignorCents = grossCents - feeCents;

  return {
    feeAmount: new Prisma.Decimal(feeCents).dividedBy(100),
    consignorAmount: new Prisma.Decimal(consignorCents).dividedBy(100),
  };
}
