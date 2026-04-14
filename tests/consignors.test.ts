import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { getConsignorDetail, updateConsignor, suspendConsignor, unsuspendConsignor } from "~/services/consignors.server";

async function setupConsignorWithListings() {
  const consignor = await createTestConsignor({ name: "Alice", email: "alice@test.com", feeRate: 0.15 });
  const product = await prisma.product.create({
    data: { title: "Test Shoe", sku: `STYLE-${Date.now()}` },
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

  it("allows 0% fee rate (store-owned)", async () => {
    const consignor = await createTestConsignor();
    const updated = await updateConsignor(consignor.id, { feeRate: 0 });
    expect(updated.feeRate).toBe(0);
  });

  it("rejects negative fee rate", async () => {
    const consignor = await createTestConsignor();
    await expect(updateConsignor(consignor.id, { feeRate: -0.01 })).rejects.toThrow("Fee rate must be between 0% and 100%");
  });

  it("rejects fee rate above 100%", async () => {
    const consignor = await createTestConsignor();
    await expect(updateConsignor(consignor.id, { feeRate: 1.01 })).rejects.toThrow("Fee rate must be between 0% and 100%");
  });
});

describe("consignors.server — suspendConsignor / unsuspendConsignor", () => {
  it("suspends an active consignor", async () => {
    const consignor = await createTestConsignor();
    const { consignor: suspended } = await suspendConsignor(consignor.id, "Policy violation");

    expect(suspended.status).toBe("suspended");
    expect(suspended.suspensionReason).toBe("Policy violation");
    expect(suspended.suspendedAt).toBeTruthy();
  });

  it("suspends without a reason", async () => {
    const consignor = await createTestConsignor();
    const { consignor: suspended } = await suspendConsignor(consignor.id);

    expect(suspended.status).toBe("suspended");
    expect(suspended.suspensionReason).toBeNull();
    expect(suspended.suspendedAt).toBeTruthy();
  });

  it("throws when suspending an already-suspended consignor", async () => {
    const consignor = await createTestConsignor();
    await suspendConsignor(consignor.id);

    await expect(suspendConsignor(consignor.id)).rejects.toThrow("already suspended");
  });

  it("throws for non-existent consignor", async () => {
    await expect(suspendConsignor("nonexistent")).rejects.toThrow("Consignor not found");
  });

  it("unsuspends a suspended consignor", async () => {
    const consignor = await createTestConsignor();
    await suspendConsignor(consignor.id, "Temp ban");
    const { consignor: reactivated } = await unsuspendConsignor(consignor.id);

    expect(reactivated.status).toBe("active");
    expect(reactivated.suspensionReason).toBeNull();
    expect(reactivated.suspendedAt).toBeNull();
  });

  it("throws when unsuspending an active consignor", async () => {
    const consignor = await createTestConsignor();
    await expect(unsuspendConsignor(consignor.id)).rejects.toThrow("not suspended");
  });

  it("throws for non-existent consignor on unsuspend", async () => {
    await expect(unsuspendConsignor("nonexistent")).rejects.toThrow("Consignor not found");
  });

  it("pauses active listings when pauseListings=true", async () => {
    const consignor = await createTestConsignor();
    const product = await prisma.product.create({ data: { title: "Test Shoe" } });
    const variant = await prisma.variant.create({ data: { productId: product.id, size: "10" } });

    // Create listings in various statuses
    await prisma.listing.createMany({
      data: [
        { consignorId: consignor.id, variantId: variant.id, price: 100, status: "active" },
        { consignorId: consignor.id, variantId: variant.id, price: 120, status: "active" },
        { consignorId: consignor.id, variantId: variant.id, price: 150, status: "submitted" },
        { consignorId: consignor.id, variantId: variant.id, price: 200, status: "sold" },
      ],
    });

    const { pausedCount } = await suspendConsignor(consignor.id, "Test", true);

    expect(pausedCount).toBe(2); // only active listings paused

    const listings = await prisma.listing.findMany({ where: { consignorId: consignor.id } });
    const paused = listings.filter((l) => l.status === "paused");
    const submitted = listings.filter((l) => l.status === "submitted");
    const sold = listings.filter((l) => l.status === "sold");

    expect(paused).toHaveLength(2);
    expect(submitted).toHaveLength(1); // not touched
    expect(sold).toHaveLength(1); // not touched
  });

  it("does NOT pause listings when pauseListings=false", async () => {
    const consignor = await createTestConsignor();
    const product = await prisma.product.create({ data: { title: "Test Shoe" } });
    const variant = await prisma.variant.create({ data: { productId: product.id, size: "10" } });

    await prisma.listing.create({
      data: { consignorId: consignor.id, variantId: variant.id, price: 100, status: "active" },
    });

    const { pausedCount } = await suspendConsignor(consignor.id, "Test", false);
    expect(pausedCount).toBe(0);

    const listings = await prisma.listing.findMany({ where: { consignorId: consignor.id } });
    expect(listings[0].status).toBe("active");
  });

  it("unsuspend reactivates paused listings", async () => {
    const consignor = await createTestConsignor();
    const product = await prisma.product.create({ data: { title: "Test Shoe" } });
    const variant = await prisma.variant.create({ data: { productId: product.id, size: "10" } });

    await prisma.listing.createMany({
      data: [
        { consignorId: consignor.id, variantId: variant.id, price: 100, status: "active" },
        { consignorId: consignor.id, variantId: variant.id, price: 120, status: "active" },
      ],
    });

    // Suspend with pause
    await suspendConsignor(consignor.id, "Test", true);

    // Verify paused
    let listings = await prisma.listing.findMany({ where: { consignorId: consignor.id } });
    expect(listings.every((l) => l.status === "paused")).toBe(true);

    // Unsuspend — should reactivate
    const { reactivatedCount } = await unsuspendConsignor(consignor.id);
    expect(reactivatedCount).toBe(2);

    listings = await prisma.listing.findMany({ where: { consignorId: consignor.id } });
    expect(listings.every((l) => l.status === "active")).toBe(true);
  });
});

describe("suspension — blocks portal submissions", () => {
  it("submitListing rejects suspended consignor", async () => {
    const consignor = await createTestConsignor();
    await suspendConsignor(consignor.id);

    await expect(
      (await import("~/services/submission.server")).submitListing({
        consignorId: consignor.id,
        title: "Test Shoe",
        size: "10",
        price: 100,
      }),
    ).rejects.toThrow("suspended");
  });

  it("deleteSubmittedListing rejects suspended consignor", async () => {
    const consignor = await createTestConsignor();

    // Create a submitted listing before suspension
    const listing = await prisma.listing.create({
      data: {
        consignorId: consignor.id,
        variantId: (
          await prisma.variant.create({
            data: {
              productId: (await prisma.product.create({ data: { title: "Shoe" } })).id,
              size: "10",
            },
          })
        ).id,
        price: 100,
        status: "submitted",
      },
    });

    await suspendConsignor(consignor.id);

    await expect(
      (await import("~/services/submission.server")).deleteSubmittedListing({
        listingId: listing.id,
        consignorId: consignor.id,
      }),
    ).rejects.toThrow("suspended");
  });

  it("requestWithdrawal rejects suspended consignor", async () => {
    const consignor = await createTestConsignor();

    const listing = await prisma.listing.create({
      data: {
        consignorId: consignor.id,
        variantId: (
          await prisma.variant.create({
            data: {
              productId: (await prisma.product.create({ data: { title: "Shoe" } })).id,
              size: "10",
            },
          })
        ).id,
        price: 100,
        status: "active",
      },
    });

    await suspendConsignor(consignor.id);

    await expect(
      (await import("~/services/submission.server")).requestWithdrawal({
        listingId: listing.id,
        consignorId: consignor.id,
      }),
    ).rejects.toThrow("suspended");
  });
});
