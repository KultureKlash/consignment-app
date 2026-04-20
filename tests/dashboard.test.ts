import { describe, it, expect, beforeEach } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { getDashboardData, getActivityFeed } from "~/services/admin-dashboard.server";
import { LISTING_STATUS } from "~/lib/listing-statuses";

// ── Helpers ──

async function createProduct(title: string, brand = "Nike") {
  return prisma.product.create({ data: { title, brand } });
}

async function createVariant(productId: string, size: string) {
  return prisma.variant.create({ data: { productId, size } });
}

async function createListing(consignorId: string, variantId: string, price: number, overrides: Record<string, unknown> = {}) {
  return prisma.listing.create({
    data: { consignorId, variantId, price, status: LISTING_STATUS.ACTIVE, listedAt: new Date(), ...overrides },
  });
}

async function createSoldListing(consignorId: string, variantId: string, price: number, soldAt?: Date) {
  return prisma.listing.create({
    data: { consignorId, variantId, price, status: LISTING_STATUS.SOLD, listedAt: new Date(), soldAt: soldAt ?? new Date() },
  });
}

// ═══════════════════════════════════════════════════════════
// getDashboardData
// ═══════════════════════════════════════════════════════════

describe("dashboard.server — getDashboardData", () => {
  it("returns zero metrics when database is empty", async () => {
    const data = await getDashboardData();
    expect(data.totalSales).toBe(0);
    expect(data.totalOrders).toBe(0);
    expect(data.allOrders).toBe(0);
    expect(data.consignmentFees).toBe(0);
    expect(data.storeProfit).toBe(0);
    expect(data.totalEarnings).toBe(0);
    expect(data.inventoryValue).toBe(0);
    expect(data.submittedCount).toBe(0);
    expect(data.awaitingDropoffCount).toBe(0);
    expect(data.withdrawalRequestCount).toBe(0);
    expect(data.pendingPickupCount).toBe(0);
    expect(data.activityFeed).toEqual([]);
  });

  it("counts action items by status", async () => {
    const c = await createTestConsignor();
    const p = await createProduct("Test Shoe");
    const v = await createVariant(p.id, "10");

    await createListing(c.id, v.id, 100, { status: LISTING_STATUS.SUBMITTED });
    await createListing(c.id, v.id, 100, { status: LISTING_STATUS.SUBMITTED });
    await createListing(c.id, v.id, 100, { status: LISTING_STATUS.APPROVED });
    await createListing(c.id, v.id, 100, { status: LISTING_STATUS.WITHDRAWAL_REQUESTED });
    await createListing(c.id, v.id, 100, { status: LISTING_STATUS.PENDING_PICKUP });

    const data = await getDashboardData();
    expect(data.submittedCount).toBe(2);
    expect(data.awaitingDropoffCount).toBe(1);
    expect(data.withdrawalRequestCount).toBe(1);
    expect(data.pendingPickupCount).toBe(1);
  });

  it("calculates inventory value from active listings only", async () => {
    const c = await createTestConsignor();
    const p = await createProduct("Test Shoe");
    const v = await createVariant(p.id, "10");

    await createListing(c.id, v.id, 200);
    await createListing(c.id, v.id, 300);
    await createListing(c.id, v.id, 150, { status: LISTING_STATUS.SOLD, soldAt: new Date() });

    const data = await getDashboardData();
    expect(Number(data.inventoryValue)).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════
// getActivityFeed
// ═══════════════════════════════════════════════════════════

describe("dashboard.server — getActivityFeed", () => {
  it("returns empty array when no listings exist", async () => {
    const feed = await getActivityFeed(10);
    expect(feed).toEqual([]);
  });

  it("returns listing events with structured fields", async () => {
    const c = await createTestConsignor({ name: "Jane Doe" });
    const p = await createProduct("Jordan 4 Retro");
    const v = await createVariant(p.id, "9");
    await createListing(c.id, v.id, 350);

    const feed = await getActivityFeed(10);
    const listingEvent = feed.find((e) => e.type === "listing");
    expect(listingEvent).toBeDefined();
    expect(listingEvent!.product).toBe("Jordan 4 Retro");
    expect(listingEvent!.size).toBe("9");
    expect(listingEvent!.detail).toBe("listed at");
    expect(listingEvent!.price).toBe("$350.00");
    expect(listingEvent!.actor).toBe("Jane Doe");
  });

  it("returns sale events for sold listings", async () => {
    const c = await createTestConsignor();
    const p = await createProduct("Nike Dunk Low");
    const v = await createVariant(p.id, "10");
    await createSoldListing(c.id, v.id, 150);

    const feed = await getActivityFeed(10);
    const saleEvent = feed.find((e) => e.type === "sale");
    expect(saleEvent).toBeDefined();
    expect(saleEvent!.product).toBe("Nike Dunk Low");
    expect(saleEvent!.detail).toBe("sold for");
    expect(saleEvent!.price).toBe("$150.00");
  });

  it("groups batch-created listings into one event with qty", async () => {
    const c = await createTestConsignor({ name: "Batch Creator" });
    const p = await createProduct("Yeezy 350");
    const v = await createVariant(p.id, "8");

    // Simulate batch creation: same consignor, product, size, and exact same createdAt
    const now = new Date();
    for (let i = 0; i < 5; i++) {
      await prisma.listing.create({
        data: { consignorId: c.id, variantId: v.id, price: 200, status: LISTING_STATUS.ACTIVE, listedAt: now, createdAt: now },
      });
    }

    const feed = await getActivityFeed(50);
    const listingEvents = feed.filter((e) => e.type === "listing");
    expect(listingEvents).toHaveLength(1);
    expect(listingEvents[0].qty).toBe(5);
    expect(listingEvents[0].actor).toBe("Batch Creator");
  });

  it("does not group listings with different timestamps", async () => {
    const c = await createTestConsignor();
    const p = await createProduct("Air Force 1");
    const v = await createVariant(p.id, "11");

    const t1 = new Date("2026-01-01T10:00:00Z");
    const t2 = new Date("2026-01-01T11:00:00Z");
    await prisma.listing.create({ data: { consignorId: c.id, variantId: v.id, price: 100, status: LISTING_STATUS.ACTIVE, listedAt: t1, createdAt: t1 } });
    await prisma.listing.create({ data: { consignorId: c.id, variantId: v.id, price: 100, status: LISTING_STATUS.ACTIVE, listedAt: t2, createdAt: t2 } });

    const feed = await getActivityFeed(50);
    const listingEvents = feed.filter((e) => e.type === "listing");
    expect(listingEvents).toHaveLength(2);
  });

  it("includes sold listings that were created long ago", async () => {
    const c = await createTestConsignor();
    const sold = await createProduct("Old Sneaker");
    const soldV = await createVariant(sold.id, "12");
    const recent = await createProduct("Recent Shoe");
    const recentV = await createVariant(recent.id, "8");

    // Created a year ago, sold just now
    const oldDate = new Date("2025-01-01");
    const now = new Date();
    await prisma.listing.create({
      data: { consignorId: c.id, variantId: soldV.id, price: 500, status: LISTING_STATUS.SOLD, listedAt: oldDate, createdAt: oldDate, soldAt: now },
    });

    // Create many recent listings (different product) to push old ones out of "recently created"
    for (let i = 0; i < 50; i++) {
      const t = new Date(Date.now() - i * 1000);
      await prisma.listing.create({
        data: { consignorId: c.id, variantId: recentV.id, price: 100, status: LISTING_STATUS.ACTIVE, listedAt: t, createdAt: t },
      });
    }

    const feed = await getActivityFeed(100);
    const saleEvent = feed.find((e) => e.type === "sale" && e.product === "Old Sneaker");
    expect(saleEvent).toBeDefined();
    expect(saleEvent!.price).toBe("$500.00");
  });

  it("respects limit parameter", async () => {
    const c = await createTestConsignor();
    const p = await createProduct("Bulk Shoe");
    const v = await createVariant(p.id, "7");

    for (let i = 0; i < 20; i++) {
      const t = new Date(Date.now() - i * 60000);
      await prisma.listing.create({
        data: { consignorId: c.id, variantId: v.id, price: 100 + i, status: LISTING_STATUS.ACTIVE, listedAt: t, createdAt: t },
      });
    }

    const feed5 = await getActivityFeed(5);
    expect(feed5.length).toBeLessThanOrEqual(5);

    const feed50 = await getActivityFeed(50);
    expect(feed50.length).toBe(20);
  });

  it("sorts events by time descending (newest first)", async () => {
    const c = await createTestConsignor();
    const p = await createProduct("Time Test");
    const v = await createVariant(p.id, "9");

    const old = new Date("2026-01-01");
    const recent = new Date("2026-04-01");
    await prisma.listing.create({ data: { consignorId: c.id, variantId: v.id, price: 100, status: LISTING_STATUS.ACTIVE, listedAt: old, createdAt: old } });
    await prisma.listing.create({ data: { consignorId: c.id, variantId: v.id, price: 200, status: LISTING_STATUS.ACTIVE, listedAt: recent, createdAt: recent } });

    const feed = await getActivityFeed(10);
    const listingEvents = feed.filter((e) => e.type === "listing");
    expect(listingEvents[0].price).toBe("$200.00");
    expect(listingEvents[1].price).toBe("$100.00");
  });
});
