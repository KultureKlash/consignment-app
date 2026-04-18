import { describe, it, expect } from "vitest";
import { PAYOUT_STATUS } from "~/lib/payout-statuses";
import { LISTING_STATUS } from "~/lib/listing-statuses";

describe("PAYOUT_STATUS", () => {
  it("has all 3 statuses", () => {
    expect(Object.keys(PAYOUT_STATUS)).toHaveLength(3);
    expect(PAYOUT_STATUS.PENDING).toBe("pending");
    expect(PAYOUT_STATUS.INVOICED).toBe("invoiced");
    expect(PAYOUT_STATUS.PAID).toBe("paid");
  });

  it("values don't overlap with LISTING_STATUS", () => {
    const payoutValues = new Set(Object.values(PAYOUT_STATUS));
    const listingValues = new Set(Object.values(LISTING_STATUS));
    for (const v of payoutValues) {
      expect(listingValues.has(v as any)).toBe(false);
    }
  });
});
