import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { createPayout, markInvoiced, markPaid, cancelPayout, getPayoutsPageData } from "~/services/payouts.server";

async function setupVariant() {
  const product = await prisma.product.create({
    data: {
      styleId: `style-${Date.now()}-${Math.random()}`,
      title: "Test Product",
    },
  });
  const variant = await prisma.variant.create({
    data: {
      productId: product.id,
      size: "9",
    },
  });
  return { product, variant };
}

/** Create a sold listing with order + transaction (simulates a completed sale) */
async function createSoldItem(consignorId: string, variantId: string, price: number) {
  const listing = await prisma.listing.create({
    data: { consignorId, variantId, price, status: "sold" },
  });
  const order = await prisma.order.create({
    data: { total: price, status: "open", paymentStatus: "paid" },
  });
  const orderItem = await prisma.orderItem.create({
    data: { orderId: order.id, listingId: listing.id, price, status: "sold" },
  });

  const consignor = await prisma.consignor.findUniqueOrThrow({ where: { id: consignorId } });
  const feeRate = consignor.feeRate;
  const grossAmount = price;
  const feeAmount = grossAmount * feeRate;
  const consignorAmount = grossAmount * (1 - feeRate);

  const transaction = await prisma.transaction.create({
    data: {
      consignorId,
      orderItemId: orderItem.id,
      type: "sale",
      salePrice: price,
      feeRate,
      grossAmount,
      feeAmount,
      consignorAmount,
      amount: consignorAmount,
    },
  });

  return { listing, order, orderItem, transaction };
}

describe("payouts.server — createPayout", () => {
  it("bundles selected transactions into a payout with correct amount", async () => {
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    const sale1 = await createSoldItem(consignor.id, variant.id, 200);
    const sale2 = await createSoldItem(consignor.id, variant.id, 300);

    const payout = await createPayout({
      consignorId: consignor.id,
      transactionIds: [sale1.transaction.id, sale2.transaction.id],
    });

    expect(payout.status).toBe("pending");
    expect(payout.consignorId).toBe(consignor.id);
    // 200 * 0.85 + 300 * 0.85 = 170 + 255 = 425
    expect(payout.amount).toBeCloseTo(425, 2);
    expect(payout.items).toHaveLength(2);
  });

  it("rejects empty transaction list", async () => {
    const consignor = await createTestConsignor();

    await expect(
      createPayout({ consignorId: consignor.id, transactionIds: [] }),
    ).rejects.toThrow("No transactions selected");
  });

  it("rejects transactions that don't belong to the consignor", async () => {
    const consignorA = await createTestConsignor({ email: "a@test.com" });
    const consignorB = await createTestConsignor({ email: "b@test.com" });
    const { variant } = await setupVariant();

    const sale = await createSoldItem(consignorA.id, variant.id, 200);

    await expect(
      createPayout({ consignorId: consignorB.id, transactionIds: [sale.transaction.id] }),
    ).rejects.toThrow("does not belong to this consignor");
  });

  it("rejects transactions already included in a payout", async () => {
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    const sale = await createSoldItem(consignor.id, variant.id, 200);

    // First payout succeeds
    await createPayout({
      consignorId: consignor.id,
      transactionIds: [sale.transaction.id],
    });

    // Second payout with same transaction fails
    await expect(
      createPayout({ consignorId: consignor.id, transactionIds: [sale.transaction.id] }),
    ).rejects.toThrow("already included in a payout");
  });

  it("rejects non-existent transaction IDs", async () => {
    const consignor = await createTestConsignor();

    await expect(
      createPayout({ consignorId: consignor.id, transactionIds: ["fake-id-123"] }),
    ).rejects.toThrow("Some transactions not found");
  });

  it("allows selecting a subset of unpaid transactions", async () => {
    const consignor = await createTestConsignor({ feeRate: 0.10 });
    const { variant } = await setupVariant();

    const sale1 = await createSoldItem(consignor.id, variant.id, 100);
    const sale2 = await createSoldItem(consignor.id, variant.id, 200);
    await createSoldItem(consignor.id, variant.id, 300); // not included

    const payout = await createPayout({
      consignorId: consignor.id,
      transactionIds: [sale1.transaction.id, sale2.transaction.id],
    });

    // 100 * 0.90 + 200 * 0.90 = 90 + 180 = 270
    expect(payout.amount).toBeCloseTo(270, 2);
    expect(payout.items).toHaveLength(2);
  });
});

describe("payouts.server — markPaid", () => {
  it("marks a pending payout as paid", async () => {
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();
    const sale = await createSoldItem(consignor.id, variant.id, 200);

    const payout = await createPayout({
      consignorId: consignor.id,
      transactionIds: [sale.transaction.id],
    });

    await markInvoiced(payout.id);
    const updated = await markPaid(payout.id);
    expect(updated.status).toBe("paid");
  });

  it("rejects marking an already paid payout", async () => {
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();
    const sale = await createSoldItem(consignor.id, variant.id, 200);

    const payout = await createPayout({
      consignorId: consignor.id,
      transactionIds: [sale.transaction.id],
    });

    await markInvoiced(payout.id);
    await markPaid(payout.id);

    await expect(markPaid(payout.id)).rejects.toThrow('must be "invoiced"');
  });
});

describe("payouts.server — cancelPayout", () => {
  it("deletes payout and its items, freeing transactions", async () => {
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();
    const sale = await createSoldItem(consignor.id, variant.id, 200);

    const payout = await createPayout({
      consignorId: consignor.id,
      transactionIds: [sale.transaction.id],
    });

    await cancelPayout(payout.id);

    // Payout should be gone
    const found = await prisma.payout.findUnique({ where: { id: payout.id } });
    expect(found).toBeNull();

    // PayoutItems should be cascade-deleted
    const items = await prisma.payoutItem.findMany({ where: { payoutId: payout.id } });
    expect(items).toHaveLength(0);

    // Transaction should still exist and be free for a new payout
    const newPayout = await createPayout({
      consignorId: consignor.id,
      transactionIds: [sale.transaction.id],
    });
    expect(newPayout.items).toHaveLength(1);
  });

  it("rejects cancelling a paid payout", async () => {
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();
    const sale = await createSoldItem(consignor.id, variant.id, 200);

    const payout = await createPayout({
      consignorId: consignor.id,
      transactionIds: [sale.transaction.id],
    });

    await markInvoiced(payout.id);
    await markPaid(payout.id);

    await expect(cancelPayout(payout.id)).rejects.toThrow("Cannot cancel a paid payout");
  });
});

describe("payouts.server — getPayoutsPageData", () => {
  it("groups unpaid transactions by consignor", async () => {
    const consignorA = await createTestConsignor({ name: "Alice", email: "alice@test.com", feeRate: 0.15 });
    const consignorB = await createTestConsignor({ name: "Bob", email: "bob@test.com", feeRate: 0.10 });
    const { variant } = await setupVariant();

    await createSoldItem(consignorA.id, variant.id, 200);
    await createSoldItem(consignorA.id, variant.id, 300);
    await createSoldItem(consignorB.id, variant.id, 400);

    const data = await getPayoutsPageData();

    expect(data.unpaidByConsignor).toHaveLength(2);

    // Sorted by total descending — Bob has higher consignor amount (400 * 0.90 = 360)
    // vs Alice (200*0.85 + 300*0.85 = 425)
    const alice = data.unpaidByConsignor.find((c) => c.consignor.name === "Alice");
    const bob = data.unpaidByConsignor.find((c) => c.consignor.name === "Bob");

    expect(alice).toBeDefined();
    expect(alice!.transactions).toHaveLength(2);
    expect(alice!.total).toBeCloseTo(425, 2);

    expect(bob).toBeDefined();
    expect(bob!.transactions).toHaveLength(1);
    expect(bob!.total).toBeCloseTo(360, 2);
  });

  it("excludes transactions already in a payout", async () => {
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    const sale1 = await createSoldItem(consignor.id, variant.id, 200);
    await createSoldItem(consignor.id, variant.id, 300);

    // Put sale1 in a payout
    await createPayout({
      consignorId: consignor.id,
      transactionIds: [sale1.transaction.id],
    });

    const data = await getPayoutsPageData();

    // Only sale2 should be unpaid
    expect(data.unpaidByConsignor).toHaveLength(1);
    expect(data.unpaidByConsignor[0].transactions).toHaveLength(1);
  });

  it("returns correct summary stats", async () => {
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    const sale1 = await createSoldItem(consignor.id, variant.id, 200);
    const sale2 = await createSoldItem(consignor.id, variant.id, 300);
    const sale3 = await createSoldItem(consignor.id, variant.id, 400);

    // Create pending payout for sale1
    await createPayout({
      consignorId: consignor.id,
      transactionIds: [sale1.transaction.id],
    });

    // Create paid payout for sale2
    const paidPayout = await createPayout({
      consignorId: consignor.id,
      transactionIds: [sale2.transaction.id],
    });
    await markInvoiced(paidPayout.id);
    await markPaid(paidPayout.id);

    const data = await getPayoutsPageData();

    // Outstanding: sale3 consignor amount = 400 * 0.85 = 340
    expect(data.stats.totalOutstanding).toBeCloseTo(340, 2);
    // Pending: sale1 consignor amount = 200 * 0.85 = 170
    expect(data.stats.totalPending).toBeCloseTo(170, 2);
    // Paid: sale2 consignor amount = 300 * 0.85 = 255
    expect(data.stats.totalPaid).toBeCloseTo(255, 2);
  });

  it("returns empty data when no transactions exist", async () => {
    const data = await getPayoutsPageData();

    expect(data.unpaidByConsignor).toHaveLength(0);
    expect(data.payouts).toHaveLength(0);
    expect(data.stats.totalOutstanding).toBe(0);
    expect(data.stats.totalPending).toBe(0);
    expect(data.stats.totalPaid).toBe(0);
  });
});
