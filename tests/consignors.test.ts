import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { getConsignorDetail, updateConsignor } from "~/services/consignors.server";

async function setupConsignorWithListings() {
  const consignor = await createTestConsignor({ name: "Alice", email: "alice@test.com", feeRate: 0.15 });
  const product = await prisma.product.create({
    data: { title: "Test Shoe", styleId: `STYLE-${Date.now()}` },
  });
  const variant = await prisma.variant.create({
    data: { productId: product.id, size: "9" },
  });

  // Create listings in various statuses
  await prisma.listing.createMany({
    data: [
      { consignorId: consignor.id, variantId: variant.id, price: 100, status: "active" },
      { consignorId: consignor.id, variantId: variant.id, price: 120, status: "active" },
      { consignorId: consignor.id, variantId: variant.id, price: 150, status: "pending_sale" },
      { consignorId: consignor.id, variantId: variant.id, price: 200, status: "sold" },
      { consignorId: consignor.id, variantId: variant.id, price: 80, status: "cancelled" },
    ],
  });

  return { consignor, product, variant };
}

describe("consignors.server — getConsignorDetail", () => {
  it("returns consignor with balance and listing counts", async () => {
    const { consignor } = await setupConsignorWithListings();

    const detail = await getConsignorDetail(consignor.id);

    expect(detail.consignor.id).toBe(consignor.id);
    expect(detail.consignor.name).toBe("Alice");
    expect(detail.consignor.email).toBe("alice@test.com");
    expect(detail.balance).toBe(0); // no transactions yet
    expect(detail.counts.active).toBe(2);
    expect(detail.counts.pending_sale).toBe(1);
    expect(detail.counts.sold).toBe(1);
    expect(detail.counts.cancelled).toBe(1);
  });

  it("returns zero counts for consignor with no listings", async () => {
    const consignor = await createTestConsignor();
    const detail = await getConsignorDetail(consignor.id);

    expect(detail.counts.active).toBe(0);
    expect(detail.counts.pending_sale).toBe(0);
    expect(detail.counts.sold).toBe(0);
    expect(detail.counts.cancelled).toBe(0);
  });

  it("throws for non-existent consignor", async () => {
    await expect(getConsignorDetail("nonexistent")).rejects.toThrow("Consignor not found");
  });

  it("includes balance from transactions", async () => {
    const consignor = await createTestConsignor();

    // Create a sale transaction directly
    await prisma.transaction.create({
      data: {
        consignorId: consignor.id,
        type: "sale",
        salePrice: 200,
        feeRate: 0.15,
        grossAmount: 200,
        feeAmount: 30,
        consignorAmount: 170,
        amount: 170,
      },
    });

    const detail = await getConsignorDetail(consignor.id);
    expect(detail.balance).toBe(170);
  });
});

describe("consignors.server — updateConsignor", () => {
  it("updates name", async () => {
    const consignor = await createTestConsignor({ name: "Old Name" });
    const updated = await updateConsignor(consignor.id, { name: "New Name" });
    expect(updated.name).toBe("New Name");
  });

  it("updates email", async () => {
    const consignor = await createTestConsignor({ email: "old@test.com" });
    const updated = await updateConsignor(consignor.id, { email: "new@test.com" });
    expect(updated.email).toBe("new@test.com");
  });

  it("updates feeRate", async () => {
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const updated = await updateConsignor(consignor.id, { feeRate: 0.20 });
    expect(updated.feeRate).toBe(0.20);
  });

  it("updates multiple fields at once", async () => {
    const consignor = await createTestConsignor({ name: "Alice", email: "alice@test.com", feeRate: 0.15 });
    const updated = await updateConsignor(consignor.id, { name: "Bob", email: "bob@test.com", feeRate: 0.10 });
    expect(updated.name).toBe("Bob");
    expect(updated.email).toBe("bob@test.com");
    expect(updated.feeRate).toBe(0.10);
  });

  it("throws for non-existent consignor", async () => {
    await expect(updateConsignor("nonexistent", { name: "X" })).rejects.toThrow("Consignor not found");
  });

  it("throws for duplicate email", async () => {
    await createTestConsignor({ email: "taken@test.com" });
    const other = await createTestConsignor({ email: "other@test.com" });

    await expect(
      updateConsignor(other.id, { email: "taken@test.com" }),
    ).rejects.toThrow("Email already in use");
  });

  it("allows keeping the same email", async () => {
    const consignor = await createTestConsignor({ email: "same@test.com" });
    // Should not throw — email hasn't changed
    const updated = await updateConsignor(consignor.id, { email: "same@test.com", name: "Updated" });
    expect(updated.name).toBe("Updated");
    expect(updated.email).toBe("same@test.com");
  });

  it("accepts custom fee rate like 13%", async () => {
    const consignor = await createTestConsignor();
    const updated = await updateConsignor(consignor.id, { feeRate: 0.13 });
    expect(updated.feeRate).toBeCloseTo(0.13);
  });

  it("rejects fee rate below 1%", async () => {
    const consignor = await createTestConsignor();
    await expect(updateConsignor(consignor.id, { feeRate: 0 })).rejects.toThrow("Fee rate must be between 1% and 99%");
  });

  it("rejects fee rate above 99%", async () => {
    const consignor = await createTestConsignor();
    await expect(updateConsignor(consignor.id, { feeRate: 1.0 })).rejects.toThrow("Fee rate must be between 1% and 99%");
  });
});
