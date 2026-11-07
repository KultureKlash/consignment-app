import { Prisma } from "@prisma/client";

/**
 * The Decimal -> number boundary.
 *
 * Money is `numeric(10,2)` in the database and `Prisma.Decimal` everywhere it is
 * computed, compared or written. But it has to become a plain number before it
 * crosses into a loader response, because:
 *
 *   - `Prisma.Decimal.toJSON()` serializes to a STRING. A component doing
 *     `reduce((s, p) => s + p.amount, 0)` would then compute `0 + "100.00"` ->
 *     `"0100.00"` -- a silently wrong total, not a crash.
 *   - `fmt()` takes a number. Handed a string it falls through to
 *     `String.prototype.toLocaleString`, which ignores the options and quietly
 *     drops the thousands separators and the 2-decimal padding.
 *
 * Converting here instead of changing `fmt` and every component keeps display
 * code untouched and keeps decimal.js out of the client bundle.
 *
 * ## This is the only sanctioned float leak
 *
 * Everything downstream of this call is display-only. Per
 * docs/coding-standards.md, client-side arithmetic on money is display-only; any
 * amount that drives a write, a comparison or a payout must be computed
 * server-side in Decimal. `grep -rn toPlainMoney app/` is therefore the complete,
 * auditable list of places a Float re-enters the system.
 */

export type DecimalToNumber<T> = T extends Prisma.Decimal
  ? number
  : T extends Date
    ? Date
    : T extends null
      ? null
      : T extends undefined
        ? undefined
        : T extends Array<infer U>
          ? Array<DecimalToNumber<U>>
          : T extends object
            ? { [K in keyof T]: DecimalToNumber<T[K]> }
            : T;

function isDecimal(value: unknown): value is Prisma.Decimal {
  return Prisma.Decimal.isDecimal(value);
}

/**
 * Deep-convert every Prisma.Decimal in a value to a number. Dates, Buffers and
 * primitives pass through untouched.
 *
 * Call it once on what a display query returns, not field by field, so adding a
 * money column to a query cannot quietly skip the boundary.
 */
export function toPlainMoney<T>(value: T): DecimalToNumber<T> {
  if (isDecimal(value)) return value.toNumber() as DecimalToNumber<T>;
  if (value === null || value === undefined) return value as DecimalToNumber<T>;
  if (value instanceof Date || Buffer.isBuffer(value)) return value as DecimalToNumber<T>;

  if (Array.isArray(value)) {
    return value.map((v) => toPlainMoney(v)) as DecimalToNumber<T>;
  }

  if (typeof value === "object") {
    // Plain objects only. A class instance other than Decimal/Date is passed
    // through rather than being flattened into a bag of properties.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value as DecimalToNumber<T>;

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toPlainMoney(v);
    }
    return out as DecimalToNumber<T>;
  }

  return value as DecimalToNumber<T>;
}
