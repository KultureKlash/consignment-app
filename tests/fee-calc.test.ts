import { describe, it, expect } from "vitest";
import { calculateFee } from "~/lib/fee-calc";
import { WITHDRAWAL_FEE_PER_ITEM } from "~/lib/finance";

describe("calculateFee", () => {
  it("calculates 15% fee correctly", () => {
    const { feeAmount, consignorAmount } = calculateFee(200, 0.15);
    expect(feeAmount).toBe(30);
    expect(consignorAmount).toBe(170);
  });

  it("calculates 12% fee correctly", () => {
    const { feeAmount, consignorAmount } = calculateFee(350, 0.12);
    expect(feeAmount).toBe(42);
    expect(consignorAmount).toBe(308);
  });

  it("handles 0% fee (store-owned)", () => {
    const { feeAmount, consignorAmount } = calculateFee(500, 0);
    expect(feeAmount).toBe(0);
    expect(consignorAmount).toBe(500);
  });

  it("handles 100% fee", () => {
    const { feeAmount, consignorAmount } = calculateFee(100, 1);
    expect(feeAmount).toBe(100);
    expect(consignorAmount).toBe(0);
  });

  it("rounds to 2 decimal places", () => {
    const { feeAmount, consignorAmount } = calculateFee(333.33, 0.15);
    expect(feeAmount).toBe(50);
    expect(consignorAmount).toBe(283.33);
  });

  it("handles small amounts", () => {
    const { feeAmount, consignorAmount } = calculateFee(1, 0.15);
    expect(feeAmount).toBe(0.15);
    expect(consignorAmount).toBe(0.85);
  });

  it("fee + consignor always equals gross", () => {
    const amounts = [100, 199.99, 350, 1000, 0.01, 333.33];
    const rates = [0, 0.05, 0.12, 0.15, 0.17, 0.25, 1];
    for (const amount of amounts) {
      for (const rate of rates) {
        const { feeAmount, consignorAmount } = calculateFee(amount, rate);
        expect(feeAmount + consignorAmount).toBeCloseTo(amount, 2);
      }
    }
  });
});

describe("WITHDRAWAL_FEE_PER_ITEM", () => {
  // Sanity check — flags accidental changes in code review.
  // Shown to consignors in the request-withdrawal modal + approved email.
  it("is $2 per item", () => {
    expect(WITHDRAWAL_FEE_PER_ITEM).toBe(2);
  });
});
