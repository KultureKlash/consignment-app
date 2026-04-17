import { describe, it, expect } from "vitest";
import { computeTax, GST_RATE, QST_RATE } from "~/lib/tax";

describe("computeTax", () => {
  describe("Quebec business consignor (GST + QST)", () => {
    const qcBusiness = { taxStatus: "business", province: "QC" };

    it("computes GST at 5% and QST at 9.975%", () => {
      const result = computeTax(1000, qcBusiness);
      expect(result.gst).toBe(50);
      expect(result.qst).toBe(99.75);
      expect(result.total).toBe(1149.75);
    });

    it("sets isTaxable and correct label", () => {
      const result = computeTax(500, qcBusiness);
      expect(result.isTaxable).toBe(true);
      expect(result.taxLabel).toBe("GST + QST");
    });

    it("rounds to 2 decimal places", () => {
      const result = computeTax(333.33, qcBusiness);
      expect(result.gst).toBe(16.67);
      expect(result.qst).toBe(33.25);
      expect(result.total).toBe(383.25);
    });

    it("handles small amounts correctly", () => {
      const result = computeTax(1, qcBusiness);
      expect(result.gst).toBe(0.05);
      expect(result.qst).toBe(0.1);
      expect(result.total).toBe(1.15);
    });
  });

  describe("Ontario business consignor (GST only)", () => {
    const onBusiness = { taxStatus: "business", province: "ON" };

    it("computes GST at 5% with no QST", () => {
      const result = computeTax(1000, onBusiness);
      expect(result.gst).toBe(50);
      expect(result.qst).toBe(0);
      expect(result.hst).toBe(0);
      expect(result.total).toBe(1050);
    });

    it("sets correct label", () => {
      const result = computeTax(500, onBusiness);
      expect(result.taxLabel).toBe("GST");
    });
  });

  describe("individual consignor (no tax)", () => {
    const individual = { taxStatus: "individual", province: "QC" };

    it("returns zero tax", () => {
      const result = computeTax(1000, individual);
      expect(result.gst).toBe(0);
      expect(result.qst).toBe(0);
      expect(result.total).toBe(1000);
    });

    it("sets isTaxable to false", () => {
      const result = computeTax(500, individual);
      expect(result.isTaxable).toBe(false);
      expect(result.taxLabel).toBe("");
    });
  });

  describe("edge cases", () => {
    const qcBusiness = { taxStatus: "business", province: "QC" };

    it("returns zero tax for $0 subtotal", () => {
      const result = computeTax(0, qcBusiness);
      expect(result.total).toBe(0);
      expect(result.gst).toBe(0);
    });

    it("returns zero tax for negative subtotal", () => {
      const result = computeTax(-100, qcBusiness);
      expect(result.total).toBe(-100);
      expect(result.gst).toBe(0);
    });

    it("business with no province defaults to GST only", () => {
      const result = computeTax(1000, { taxStatus: "business", province: null });
      expect(result.gst).toBe(50);
      expect(result.qst).toBe(0);
      expect(result.total).toBe(1050);
    });

    it("business with empty string province defaults to GST only", () => {
      const result = computeTax(1000, { taxStatus: "business", province: "" });
      expect(result.gst).toBe(50);
      expect(result.qst).toBe(0);
    });

    it("subtotal passes through unchanged", () => {
      const result = computeTax(1234.56, { taxStatus: "individual" });
      expect(result.subtotal).toBe(1234.56);
    });

    it("real payout scenario: $1,105 QC business", () => {
      const result = computeTax(1105, qcBusiness);
      expect(result.gst).toBe(55.25);
      expect(result.qst).toBe(110.22);
      expect(result.total).toBe(1270.47);
    });
  });

  describe("rate constants", () => {
    it("GST rate is 5%", () => {
      expect(GST_RATE).toBe(0.05);
    });

    it("QST rate is 9.975%", () => {
      expect(QST_RATE).toBe(0.09975);
    });
  });
});
