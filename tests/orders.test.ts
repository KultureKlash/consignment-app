import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import { processOrder, cancelOrder, refundOrder, getConsignorBalance, creditOrder } from "~/services/orders";
import { getOrderDetail } from "~/services/orders";

async function setupVariant(shopifyVariantId = "gid://shopify/ProductVariant/100") {
  const product = await prisma.product.create({
    data: {
      sku: `style-${Date.now()}-${Math.random()}`,
      title: "Test Product",
      shopifyProductId: "gid://shopify/Product/1",
    },
  });
  const variant = await prisma.variant.create({
    data: {
      productId: product.id,
      size: "9",
      gtin: "TEST-GTIN-9",
      shopifyVariantId,
      inventoryItemId: "gid://shopify/InventoryItem/1",
    },
  });
  return { product, variant };
}

/** Create N individual listings (per-item model: each row = 1 physical item) */
async function createListings(
  consignorId: string,
  variantId: string,
  price: number,
  count: number,
) {
  const listings = [];
  for (let i = 0; i < count; i++) {
    const listing = await prisma.listing.create({
      data: { consignorId, variantId, price, status: "active" },
    });
    listings.push(listing);
  }
  return listings;
}

describe("orders.server — processOrder", () => {
  it("allocates individual listings and marks them pending_sale", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 350, 5);

    const order = await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/1",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    expect(order.total).toBe(700); // 350 * 2
    expect(order.status).toBe("open");

    // 2 listings should be pending_sale, 3 should remain active
    const pendingListings = await prisma.listing.findMany({ where: { variantId: variant.id, status: "pending_sale" } });
    const activeListings = await prisma.listing.findMany({ where: { variantId: variant.id, status: "active" } });
    expect(pendingListings).toHaveLength(2);
    expect(activeListings).toHaveLength(3);

    // Each pending listing should have soldAt set
    expect(pendingListings.every((l) => l.soldAt !== null)).toBe(true);

    // 2 order items (1 per listing)
    expect(order.items).toHaveLength(2);
    expect(order.items.every((i) => i.price === 350)).toBe(true);
  });

  it("allocates lowest price first across multiple listings", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    // 1 listing at $340, 2 listings at $350
    const [cheapListing] = await createListings(consignor.id, variant.id, 340, 1);
    const expensiveListings = await createListings(consignor.id, variant.id, 350, 2);

    const order = await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/3",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    // Should take the $340 one first, then 1 of the $350 ones
    expect(order.total).toBe(690); // 340 + 350
    expect(order.items).toHaveLength(2);

    // Cheap listing should be pending_sale
    const updatedCheap = await prisma.listing.findUnique({ where: { id: cheapListing.id } });
    expect(updatedCheap?.status).toBe("pending_sale");

    // One expensive listing pending_sale, one still active
    const pendingExpensive = await prisma.listing.findMany({
      where: { id: { in: expensiveListings.map((l) => l.id) }, status: "pending_sale" },
    });
    const activeExpensive = await prisma.listing.findMany({
      where: { id: { in: expensiveListings.map((l) => l.id) }, status: "active" },
    });
    expect(pendingExpensive).toHaveLength(1);
    expect(activeExpensive).toHaveLength(1);
  });

  it("FIFO tiebreak when prices are equal", async () => {
    const { admin } = createMockAdmin();
    const consignor1 = await createTestConsignor({ email: "first@test.com" });
    const consignor2 = await createTestConsignor({ email: "second@test.com" });
    const { variant } = await setupVariant();

    // First listed (earlier createdAt)
    const [listingFirst] = await createListings(consignor1.id, variant.id, 350, 1);
    // Second listed (later createdAt)
    await createListings(consignor2.id, variant.id, 350, 1);

    const order = await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/4",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
    });

    // Should allocate from the FIRST listing (earlier createdAt)
    expect(order.items).toHaveLength(1);
    expect(order.items[0].listingId).toBe(listingFirst.id);
  });

  it("throws and rolls back on insufficient inventory", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 350, 2);

    await expect(
      processOrder({
        admin,
        shopifyOrderId: "gid://shopify/Order/5",
        lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 5, price: 350 }],
      })
    ).rejects.toThrow("Insufficient inventory");

    // Transaction should have rolled back
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.orderItem.count()).toBe(0);
    expect(await prisma.transaction.count()).toBe(0);

    // Listings should be unchanged
    const activeListings = await prisma.listing.findMany({ where: { variantId: variant.id, status: "active" } });
    expect(activeListings).toHaveLength(2);
  });

  it("creates per-item transactions with correct commission", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 3);

    const order = await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/6",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    // Per-item model: 2 order items, each gets its own transaction
    const transactions = await prisma.transaction.findMany();
    expect(transactions).toHaveLength(2);
    expect(transactions.every((t) => t.type === "sale")).toBe(true);

    // Each transaction: 200 - (200 * 0.15) = 170
    expect(transactions.every((t) => t.amount === 170)).toBe(true);
    expect(transactions.every((t) => t.salePrice === 200)).toBe(true);
    expect(transactions.every((t) => t.feeRate === 0.15)).toBe(true);
    expect(transactions.every((t) => t.grossAmount === 200)).toBe(true);
    expect(transactions.every((t) => t.feeAmount === 30)).toBe(true);
    expect(transactions.every((t) => t.consignorAmount === 170)).toBe(true);
  });

  it("handles multiple line items (different variants)", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();

    const { variant: variant1 } = await setupVariant("gid://shopify/ProductVariant/200");
    const product2 = await prisma.product.create({
      data: { sku: "STYLE-2", title: "Product 2", shopifyProductId: "gid://shopify/Product/2" },
    });
    const variant2 = await prisma.variant.create({
      data: {
        productId: product2.id,
        size: "10",
        gtin: "TEST-GTIN-10",
        shopifyVariantId: "gid://shopify/ProductVariant/201",
        inventoryItemId: "gid://shopify/InventoryItem/2",
      },
    });

    await createListings(consignor.id, variant1.id, 350, 3);
    await createListings(consignor.id, variant2.id, 450, 2);

    const order = await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/7",
      lineItems: [
        { shopifyVariantId: "gid://shopify/ProductVariant/200", quantity: 1, price: 350 },
        { shopifyVariantId: "gid://shopify/ProductVariant/201", quantity: 1, price: 450 },
      ],
    });

    expect(order.total).toBe(800); // 350 + 450
    expect(order.items).toHaveLength(2);
  });

  it("syncs inventory for each affected variant", async () => {
    const { admin, findCalls } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 350, 5);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/8",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    const setCalls = findCalls("inventorySetQuantities");
    expect(setCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("transaction captures commission rate snapshot (rate change after sale)", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 300, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/snapshot-test",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 300 }],
      financialStatus: "paid",
    });

    // Change the consignor's fee rate AFTER the sale
    await prisma.consignor.update({
      where: { id: consignor.id },
      data: { feeRate: 0.30 },
    });

    // The transaction should still reflect the ORIGINAL rate (0.15)
    const txs = await prisma.transaction.findMany({ where: { type: "sale" } });
    expect(txs).toHaveLength(1);
    expect(txs[0].feeRate).toBe(0.15);
    expect(txs[0].feeAmount).toBe(45); // 300 * 0.15
    expect(txs[0].consignorAmount).toBe(255); // 300 - 45
    expect(txs[0].amount).toBe(255);
  });

  it("idempotent: duplicate shopifyOrderId returns existing order", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 350, 5);

    const order1 = await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/9",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
    });

    const order2 = await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/9",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
    });

    expect(order2.id).toBe(order1.id);

    // Only 1 listing should be pending_sale (not 2)
    const pendingCount = await prisma.listing.count({ where: { variantId: variant.id, status: "pending_sale" } });
    expect(pendingCount).toBe(1);
  });
});

describe("orders.server — cancelOrder", () => {
  it("restores listings to active and clears soldAt", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    const listings = await createListings(consignor.id, variant.id, 350, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/10",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    // Both listings should be pending_sale (unpaid)
    for (const l of listings) {
      const pending = await prisma.listing.findUnique({ where: { id: l.id } });
      expect(pending?.status).toBe("pending_sale");
      expect(pending?.soldAt).not.toBeNull();
    }

    // Cancel the order
    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/10" });

    // Both listings should be restored
    for (const l of listings) {
      const restored = await prisma.listing.findUnique({ where: { id: l.id } });
      expect(restored?.status).toBe("active");
      expect(restored?.soldAt).toBeNull();
    }
  });

  it("cancel unpaid order creates no transactions", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/11",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    // No sale transactions (order is unpaid)
    expect(await prisma.transaction.count()).toBe(0);

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/11" });

    // No transactions of any kind
    expect(await prisma.transaction.count()).toBe(0);

    // But listings should be restored
    const activeCount = await prisma.listing.count({ where: { variantId: variant.id, status: "active" } });
    expect(activeCount).toBe(2);
  });

  it("creates refund transactions when payment was captured", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/11b",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    // Cancel paid order → refund transactions
    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/11b" });

    // Per-item: 2 sale + 2 refund = 4 transactions
    const refundTxs = await prisma.transaction.findMany({ where: { type: "refund" } });
    expect(refundTxs).toHaveLength(2);
    expect(refundTxs.every((t) => t.amount === -170)).toBe(true); // -(200 * 0.85)

    // No void transactions
    const voidTxs = await prisma.transaction.findMany({ where: { type: "void" } });
    expect(voidTxs).toHaveLength(0);

    // Net should be zero
    const allTxs = await prisma.transaction.findMany();
    const net = allTxs.reduce((sum, t) => sum + t.amount, 0);
    expect(net).toBe(0);
  });

  it("sets order status to cancelled", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 350, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/12",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
    });

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/12" });

    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/12" } });
    expect(order?.status).toBe("cancelled");
  });

  it("marks all order items as refunded", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 350, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/13",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/13" });

    const items = await prisma.orderItem.findMany();
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.status === "refunded")).toBe(true);
  });

  it("syncs inventory back to Shopify after cancel", async () => {
    const { admin, findCalls } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 350, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/14",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
    });

    const callsBefore = findCalls("inventorySetQuantities").length;

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/14" });

    const callsAfter = findCalls("inventorySetQuantities").length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });

  it("throws if order already cancelled", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 350, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/15",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
    });

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/15" });

    await expect(
      cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/15" })
    ).rejects.toThrow("already cancelled");
  });

  it("cancel after refund: updates status from refunded to cancelled (Shopify cancel flow)", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 350, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/16",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
      financialStatus: "paid",
    });

    // Shopify fires refunds/create first when cancelling with "Refund payment"
    await refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/16" });

    let order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/16" } });
    expect(order?.status).toBe("refunded");

    // Then orders/cancelled arrives — should NOT throw, just update status
    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/16" });

    order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/16" } });
    expect(order?.status).toBe("cancelled");

    // Listing should be active (restored by refund)
    const activeCount = await prisma.listing.count({ where: { variantId: variant.id, status: "active" } });
    expect(activeCount).toBe(1);
  });

  it("restores multiple listings from multi-listing order", async () => {
    const { admin } = createMockAdmin();
    const consignor1 = await createTestConsignor({ email: "a@test.com" });
    const consignor2 = await createTestConsignor({ email: "b@test.com" });
    const { variant } = await setupVariant();

    // 1 listing at $340, 2 listings at $350
    const [listing1] = await createListings(consignor1.id, variant.id, 340, 1);
    const listings2 = await createListings(consignor2.id, variant.id, 350, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/17",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    // listing1 ($340) should be pending_sale, 1 of listings2 should be pending_sale
    expect((await prisma.listing.findUnique({ where: { id: listing1.id } }))?.status).toBe("pending_sale");

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/17" });

    // All listings should be restored to active
    const allActive = await prisma.listing.findMany({ where: { variantId: variant.id, status: "active" } });
    expect(allActive).toHaveLength(3);
  });
});

describe("orders.server — refundOrder", () => {
  it("full refund restores all items and sets status to refunded", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    const listings = await createListings(consignor.id, variant.id, 350, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/20",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
      financialStatus: "paid",
    });

    await refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/20" });

    // Both listings restored to active
    for (const l of listings) {
      const restored = await prisma.listing.findUnique({ where: { id: l.id } });
      expect(restored?.status).toBe("active");
      expect(restored?.soldAt).toBeNull();
    }

    // Order status
    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/20" } });
    expect(order?.status).toBe("refunded");
    expect(order?.paymentStatus).toBe("refunded");
  });

  it("partial refund restores only specified items", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();

    const { variant: variant1 } = await setupVariant("gid://shopify/ProductVariant/300");
    const product2 = await prisma.product.create({
      data: { sku: "STYLE-PARTIAL", title: "Product 2", shopifyProductId: "gid://shopify/Product/2" },
    });
    const variant2 = await prisma.variant.create({
      data: {
        productId: product2.id,
        size: "10",
        shopifyVariantId: "gid://shopify/ProductVariant/301",
        inventoryItemId: "gid://shopify/InventoryItem/2",
      },
    });

    await createListings(consignor.id, variant1.id, 350, 2);
    await createListings(consignor.id, variant2.id, 450, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/21",
      lineItems: [
        { shopifyVariantId: "gid://shopify/ProductVariant/300", quantity: 2, price: 350 },
        { shopifyVariantId: "gid://shopify/ProductVariant/301", quantity: 1, price: 450 },
      ],
      financialStatus: "paid",
    });

    // Partial refund: only variant1
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/21",
      refundLineItems: [
        { shopifyVariantId: "gid://shopify/ProductVariant/300", quantity: 2 },
      ],
    });

    // variant1 listings should be restored to active
    const v1Active = await prisma.listing.count({ where: { variantId: variant1.id, status: "active" } });
    expect(v1Active).toBe(2);

    // variant2 listing should still be sold
    const v2Sold = await prisma.listing.count({ where: { variantId: variant2.id, status: "sold" } });
    expect(v2Sold).toBe(1);
  });

  it("partial refund keeps order open until all items refunded", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();

    const { variant: variant1 } = await setupVariant("gid://shopify/ProductVariant/400");
    const product2 = await prisma.product.create({
      data: { sku: "STYLE-OPEN", title: "Product 2", shopifyProductId: "gid://shopify/Product/2" },
    });
    const variant2 = await prisma.variant.create({
      data: {
        productId: product2.id,
        size: "10",
        shopifyVariantId: "gid://shopify/ProductVariant/401",
        inventoryItemId: "gid://shopify/InventoryItem/2",
      },
    });

    await createListings(consignor.id, variant1.id, 350, 1);
    await createListings(consignor.id, variant2.id, 450, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/22",
      lineItems: [
        { shopifyVariantId: "gid://shopify/ProductVariant/400", quantity: 1, price: 350 },
        { shopifyVariantId: "gid://shopify/ProductVariant/401", quantity: 1, price: 450 },
      ],
      financialStatus: "paid",
    });

    // Refund only one item
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/22",
      refundLineItems: [
        { shopifyVariantId: "gid://shopify/ProductVariant/400", quantity: 1 },
      ],
    });

    // Order should still be open
    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/22" } });
    expect(order?.status).toBe("open");
    expect(order?.paymentStatus).toBe("paid");

    // Refund the second item
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/22",
      refundLineItems: [
        { shopifyVariantId: "gid://shopify/ProductVariant/401", quantity: 1 },
      ],
    });

    // Now order should be fully refunded
    const finalOrder = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/22" } });
    expect(finalOrder?.status).toBe("refunded");
    expect(finalOrder?.paymentStatus).toBe("refunded");
  });

  it("creates correct refund transactions per item", async () => {
    const { admin } = createMockAdmin();
    const consignor1 = await createTestConsignor({ email: "c1@test.com", feeRate: 0.15 });
    const consignor2 = await createTestConsignor({ email: "c2@test.com", feeRate: 0.20 });
    const { variant } = await setupVariant();

    await createListings(consignor1.id, variant.id, 340, 1);
    await createListings(consignor2.id, variant.id, 350, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/23",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
      financialStatus: "paid",
    });

    await refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/23" });

    const refundTxs = await prisma.transaction.findMany({
      where: { type: "refund" },
      orderBy: { amount: "asc" },
    });
    expect(refundTxs).toHaveLength(2);

    // consignor1: -(340 * (1 - 0.15)) = -289
    // consignor2: -(350 * (1 - 0.20)) = -280
    const amounts = refundTxs.map((t) => t.amount).sort((a, b) => a - b);
    expect(amounts[0]).toBe(-289); // consignor1
    expect(amounts[1]).toBe(-280); // consignor2

    // Net should be zero
    const allTxs = await prisma.transaction.findMany();
    const net = allTxs.reduce((sum, t) => sum + t.amount, 0);
    expect(Math.abs(net)).toBeLessThan(0.001);
  });

  it("throws if order is cancelled", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 350, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/24",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
      financialStatus: "paid",
    });

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/24" });

    await expect(
      refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/24" })
    ).rejects.toThrow("cancelled");
  });

  it("throws if order already fully refunded", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 350, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/25",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
      financialStatus: "paid",
    });

    await refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/25" });

    await expect(
      refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/25" })
    ).rejects.toThrow("already fully refunded");
  });

  it("refund 1 of 3 items: correct item refunded, others remain sold", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 350, 5);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/26",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 3, price: 350 }],
      financialStatus: "paid",
    });

    // Refund 1 of the 3
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/26",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1 },
      ],
    });

    // 1 listing restored to active (2 sold + 3 originally active = 4 active total, 2 sold)
    const activeCount = await prisma.listing.count({ where: { variantId: variant.id, status: "active" } });
    const soldCount = await prisma.listing.count({ where: { variantId: variant.id, status: "sold" } });
    expect(activeCount).toBe(3); // 2 never sold + 1 restored
    expect(soldCount).toBe(2);

    // 3 order items: 2 sold, 1 refunded
    const items = await prisma.orderItem.findMany();
    expect(items).toHaveLength(3);
    expect(items.filter((i) => i.status === "sold")).toHaveLength(2);
    expect(items.filter((i) => i.status === "refunded")).toHaveLength(1);

    // Refund transaction: -(350 * 0.85) = -297.5
    const refundTxs = await prisma.transaction.findMany({ where: { type: "refund" } });
    expect(refundTxs).toHaveLength(1);
    expect(refundTxs[0].amount).toBe(-297.5);

    // Order should still be open (2 items not refunded)
    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/26" } });
    expect(order?.status).toBe("open");
    // Order total should reflect only sold items: 350 * 2 = 700
    expect(order?.total).toBe(700);
  });

  it("order total recalculates to 0 after full refund", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 350, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/total-full",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
      financialStatus: "paid",
    });

    let order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/total-full" } });
    expect(order?.total).toBe(700);

    await refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/total-full" });

    order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/total-full" } });
    expect(order?.total).toBe(0);
    expect(order?.status).toBe("refunded");
  });

  it("order total recalculates correctly after partial refund on multi-price order", async () => {
    const { admin } = createMockAdmin();
    const consignor1 = await createTestConsignor({ email: "t1@test.com" });
    const consignor2 = await createTestConsignor({ email: "t2@test.com" });
    const { variant } = await setupVariant();

    await createListings(consignor1.id, variant.id, 340, 1);
    await createListings(consignor2.id, variant.id, 450, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/total-partial",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 340 }],
      financialStatus: "paid",
    });

    let order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/total-partial" } });
    expect(order?.total).toBe(790); // 340 + 450

    // Refund 1 unit — reverse priority takes the $450 item first
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/total-partial",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/total-partial" } });
    expect(order?.total).toBe(340); // only the $340 item remains
    expect(order?.status).toBe("open");
  });

  it("cancel order sets total to 0", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 350, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/total-cancel",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
    });

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/total-cancel" });

    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/total-cancel" } });
    expect(order?.total).toBe(0);
    expect(order?.status).toBe("cancelled");
  });

  // === Chained Refunds ===

  it("chained partial refunds: refund 1 → 1 → 1 from 3 items", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 5);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/chain-1",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 3, price: 200 }],
      financialStatus: "paid",
    });

    // Refund 1
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/chain-1",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    let items = await prisma.orderItem.findMany();
    expect(items).toHaveLength(3);
    expect(items.filter((i) => i.status === "refunded")).toHaveLength(1);

    let order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/chain-1" } });
    expect(order?.status).toBe("open");

    // Refund 1 more
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/chain-1",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    items = await prisma.orderItem.findMany();
    expect(items.filter((i) => i.status === "refunded")).toHaveLength(2);

    order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/chain-1" } });
    expect(order?.status).toBe("open");

    // Refund last 1
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/chain-1",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    items = await prisma.orderItem.findMany();
    expect(items.filter((i) => i.status === "refunded")).toHaveLength(3);

    order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/chain-1" } });
    expect(order?.status).toBe("refunded");

    // All 3 listings restored to active (5 total active)
    const activeCount = await prisma.listing.count({ where: { variantId: variant.id, status: "active" } });
    expect(activeCount).toBe(5);

    // 3 refund transactions
    const refundTxs = await prisma.transaction.findMany({ where: { type: "refund" } });
    expect(refundTxs).toHaveLength(3);

    // Net balance should be zero
    const allTxs = await prisma.transaction.findMany();
    const net = allTxs.reduce((sum, t) => sum + t.amount, 0);
    expect(Math.abs(net)).toBeLessThan(0.001);
  });

  it("over-refund rejection: cannot refund more than available", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/over-refund",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    // Refund 1
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/over-refund",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    // Try to refund 2 more (only 1 left) → should throw
    await expect(
      refundOrder({
        admin,
        shopifyOrderId: "gid://shopify/Order/over-refund",
        refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2 }],
      })
    ).rejects.toThrow("only 1 available to refund");

    // Verify state unchanged after rejection (1 refunded, 1 remaining sold)
    const items = await prisma.orderItem.findMany();
    expect(items).toHaveLength(2);
    expect(items.filter((i) => i.status === "refunded")).toHaveLength(1);
    expect(items.filter((i) => i.status === "sold")).toHaveLength(1);
  });

  it("reverse priority: refunds last allocated item first (highest price)", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    // Create two listings at different prices
    const [cheapListing] = await createListings(consignor.id, variant.id, 200, 1);
    const [expensiveListing] = await createListings(consignor.id, variant.id, 220, 1);

    // Buy both (allocates cheapest first: $200 then $220)
    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/reverse-prio",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 220 }],
      financialStatus: "paid",
    });

    // Verify both listings sold
    expect((await prisma.listing.findUnique({ where: { id: cheapListing.id } }))?.status).toBe("sold");
    expect((await prisma.listing.findUnique({ where: { id: expensiveListing.id } }))?.status).toBe("sold");

    // Refund 1 — should refund the $220 listing first (reverse allocation: last allocated first)
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/reverse-prio",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    // Expensive listing should be restored, cheap listing still sold
    const updatedExpensive = await prisma.listing.findUnique({ where: { id: expensiveListing.id } });
    expect(updatedExpensive?.status).toBe("active");

    const updatedCheap = await prisma.listing.findUnique({ where: { id: cheapListing.id } });
    expect(updatedCheap?.status).toBe("sold");

    // Verify the refund transaction is for the $220 item
    const refundTxs = await prisma.transaction.findMany({ where: { type: "refund" } });
    expect(refundTxs).toHaveLength(1);
    expect(refundTxs[0].salePrice).toBe(220);
  });

  it("reverse priority tiebreak: same price refunds newest listing first", async () => {
    const { admin } = createMockAdmin();
    const consignor1 = await createTestConsignor({ email: "older@test.com" });
    const consignor2 = await createTestConsignor({ email: "newer@test.com" });
    const { variant } = await setupVariant();

    // Both same price — older listing first
    const [olderListing] = await createListings(consignor1.id, variant.id, 300, 1);
    const [newerListing] = await createListings(consignor2.id, variant.id, 300, 1);

    // Buy both (purchase allocates oldest first)
    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/tiebreak",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 300 }],
      financialStatus: "paid",
    });

    // Refund 1 — should refund the NEWER listing first (reverse tiebreak)
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/tiebreak",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    // Newer listing restored, older still sold
    const updatedNewer = await prisma.listing.findUnique({ where: { id: newerListing.id } });
    expect(updatedNewer?.status).toBe("active");

    const updatedOlder = await prisma.listing.findUnique({ where: { id: olderListing.id } });
    expect(updatedOlder?.status).toBe("sold");
  });

  it("chained partial refunds with balance tracking", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 5);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/chain-balance",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 3, price: 200 }],
      financialStatus: "paid",
    });

    // Sale: 3 items × 200 × 0.85 = 510
    let balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(510);

    // Refund 1: -170
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/chain-balance",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(340); // 510 - 170

    // Refund 1 more: -170
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/chain-balance",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(170); // 340 - 170

    // Refund last 1: -170
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/chain-balance",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(0);
  });

  it("cancel partially-refunded order: restores only remaining items", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 5);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/cancel-partial",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    // 2 listings sold, 3 active
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "sold" } })).toBe(2);
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(3);

    // Refund 1 of 2
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/cancel-partial",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    // 1 sold, 4 active
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "sold" } })).toBe(1);
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(4);

    // Cancel the order — should restore the remaining 1 sold item
    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/cancel-partial" });

    // All 5 listings should be active
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(5);

    // All order items should be refunded
    const items = await prisma.orderItem.findMany();
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.status === "refunded")).toBe(true);

    // Net balance should be zero
    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(0);
  });
});

describe("orders.server — refundOrder restock handling", () => {
  it("no_restock refund skips inventory restore but creates transaction", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/no-restock-1",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    // 2 sold, 1 active
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(1);

    // Refund 1 with no_restock (damaged/goodwill)
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/no-restock-1",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1, restockType: "no_restock" },
      ],
    });

    // Listing should NOT be restored — still 1 active (sold listing stays sold)
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(1);

    // But order item should be marked refunded
    const items = await prisma.orderItem.findMany();
    expect(items.filter((i) => i.status === "refunded")).toHaveLength(1);

    // Refund transaction should exist
    const refundTxs = await prisma.transaction.findMany({ where: { type: "refund" } });
    expect(refundTxs).toHaveLength(1);
    expect(refundTxs[0].amount).toBe(-170); // 200 * 0.85

    // Balance should be reduced
    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(170); // 340 - 170
  });

  it("return refund restores inventory", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/return-1",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    // 1 active, 2 sold
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/return-1",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1, restockType: "return" },
      ],
    });

    // 1 listing restored → 2 active, 1 sold
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(2);
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "sold" } })).toBe(1);
  });

  it("no_restock full refund sets order to refunded without restoring inventory", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/no-restock-full",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 200 }],
      financialStatus: "paid",
    });

    // Listing sold
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "sold" } })).toBe(1);

    // Refund with no_restock
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/no-restock-full",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1, restockType: "no_restock" },
      ],
    });

    // Order should be refunded
    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/no-restock-full" } });
    expect(order?.status).toBe("refunded");

    // But listing should still be sold — no ghost inventory
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "sold" } })).toBe(1);
  });

  it("mixed restock types: return + no_restock in chained refunds", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/mixed-restock",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    // 1 active, 2 sold

    // Refund 1 with return (restore inventory)
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/mixed-restock",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1, restockType: "return" },
      ],
    });

    // 2 active, 1 sold
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(2);

    // Refund 1 with no_restock (do NOT restore)
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/mixed-restock",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1, restockType: "no_restock" },
      ],
    });

    // Still 2 active — no_restock did NOT add inventory
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(2);

    // Order should be fully refunded
    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/mixed-restock" } });
    expect(order?.status).toBe("refunded");

    // Both order items refunded
    const items = await prisma.orderItem.findMany();
    expect(items.every((i) => i.status === "refunded")).toBe(true);
  });

  it("default restockType is return (backward compat)", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/default-restock",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 200 }],
      financialStatus: "paid",
    });

    // 1 active, 1 sold. Refund without specifying restockType
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/default-restock",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1 },
      ],
    });

    // Should restore inventory (default = "return")
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(2);
  });

  it("duplicate refund webhook does not double-restore inventory", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/dup-refund",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 200 }],
      financialStatus: "paid",
    });

    // First refund: restore inventory
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/dup-refund",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1, restockType: "return" },
      ],
    });

    // Listing restored
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(1);

    // Second identical refund (webhook retry) — should throw, order already fully refunded
    await expect(
      refundOrder({
        admin,
        shopifyOrderId: "gid://shopify/Order/dup-refund",
        refundLineItems: [
          { shopifyVariantId: variant.shopifyVariantId!, quantity: 1, restockType: "return" },
        ],
      })
    ).rejects.toThrow("already fully refunded");

    // Listing should still be 1 — not double-restored
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(1);
  });
});

describe("orders.server — getConsignorBalance", () => {
  it("returns 0 with no transactions", async () => {
    const consignor = await createTestConsignor();
    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(0);
  });

  it("returns sale amount after order", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/30",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    // 2 items × 200 × 0.85 = 340
    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(340);
  });

  it("returns 0 after order + full refund", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/31",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    await refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/31" });

    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(0);
  });

  it("returns partial amount after order + partial refund", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/32",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 3, price: 200 }],
      financialStatus: "paid",
    });

    // Sale: 3 × 200 × 0.85 = 510
    // Refund 1: -(200 × 0.85) = -170
    // Balance: 510 - 170 = 340
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/32",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1 },
      ],
    });

    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(340);
  });

  it("subtracts completed payouts from balance", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/33",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    // Sale: 2 × 200 × 0.85 = 340

    // Create a paid payout of $100
    await prisma.payout.create({
      data: { consignorId: consignor.id, amount: 100, status: "paid" },
    });

    // Also create a pending payout — should NOT be subtracted
    await prisma.payout.create({
      data: { consignorId: consignor.id, amount: 50, status: "pending" },
    });

    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(240); // 340 - 100 (pending $50 not deducted)
  });

  it("returns 0 after order + cancel (not just refund)", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/34",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/34" });

    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(0);
  });
});

describe("orders.server — payment status", () => {
  it("processOrder without financialStatus: no transactions, paymentStatus pending", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/ps-1",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    // 2 listings pending_sale, 1 active
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "pending_sale" } })).toBe(2);
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(1);

    // No transactions created
    expect(await prisma.transaction.count()).toBe(0);

    // Order is pending payment
    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/ps-1" } });
    expect(order?.paymentStatus).toBe("pending");

    // Balance is $0
    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(0);
  });

  it("processOrder with financialStatus paid: creates transactions immediately", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/ps-2",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    // Per-item: 2 transactions
    const txs = await prisma.transaction.findMany();
    expect(txs).toHaveLength(2);
    expect(txs.every((t) => t.type === "sale")).toBe(true);
    expect(txs.every((t) => t.amount === 170)).toBe(true); // 200 * 0.85

    // Order is paid
    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/ps-2" } });
    expect(order?.paymentStatus).toBe("paid");

    // Balance reflects sale
    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(340);
  });

  it("creditOrder on pending order creates transactions and sets paymentStatus paid", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/ps-3",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    // Verify pending state — listings should be pending_sale, not sold
    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "pending_sale" } })).toBe(2);

    // Credit the order (simulates orders/paid webhook)
    await creditOrder({ shopifyOrderId: "gid://shopify/Order/ps-3" });

    // Per-item: 2 transactions
    const txs = await prisma.transaction.findMany();
    expect(txs).toHaveLength(2);
    expect(txs.every((t) => t.type === "sale")).toBe(true);
    expect(txs.every((t) => t.amount === 170)).toBe(true);

    // Order is now paid
    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/ps-3" } });
    expect(order?.paymentStatus).toBe("paid");

    // Listings should now be promoted to sold
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "sold" } })).toBe(2);
  });

  it("creditOrder is idempotent: calling twice creates only one set of transactions", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/ps-4",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    await creditOrder({ shopifyOrderId: "gid://shopify/Order/ps-4" });
    await creditOrder({ shopifyOrderId: "gid://shopify/Order/ps-4" });

    // Only 2 sale transactions (1 per item, not doubled)
    const txs = await prisma.transaction.findMany();
    expect(txs).toHaveLength(2);
  });

  it("creditOrder on cancelled order is a no-op", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/ps-5",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 200 }],
    });

    // Cancel the unpaid order
    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/ps-5" });

    // Now payment webhook arrives late — should not credit a cancelled order
    await creditOrder({ shopifyOrderId: "gid://shopify/Order/ps-5" });

    // No transactions created
    expect(await prisma.transaction.count()).toBe(0);

    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(0);
  });

  it("cancelOrder on paid order creates offsetting refund transactions", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/ps-6",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    // Verify sale transactions exist (2 per-item)
    expect(await prisma.transaction.count()).toBe(2);

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/ps-6" });

    // Should have 2 sale + 2 refund = 4 transactions
    const allTxs = await prisma.transaction.findMany();
    expect(allTxs).toHaveLength(4);

    const refundTxs = allTxs.filter((t) => t.type === "refund");
    expect(refundTxs).toHaveLength(2);
    expect(refundTxs.every((t) => t.amount === -170)).toBe(true);

    // Net balance = 0
    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(0);

    // paymentStatus should be "refunded"
    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/ps-6" } });
    expect(order?.paymentStatus).toBe("refunded");
  });

  it("cancelOrder on unpaid order creates no transactions", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/ps-7",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/ps-7" });

    // No transactions at all
    expect(await prisma.transaction.count()).toBe(0);

    // Inventory restored
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(2);

    // paymentStatus should be "voided"
    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/ps-7" } });
    expect(order?.paymentStatus).toBe("voided");
  });

  it("refundOrder on unpaid order throws", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/ps-8",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 200 }],
    });

    await expect(
      refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/ps-8" })
    ).rejects.toThrow("Cannot refund an unpaid order");
  });

  it("balance is $0 for unpaid orders", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 500, 3);

    // Process multiple orders without payment
    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/ps-9a",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 500 }],
    });
    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/ps-9b",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 500 }],
    });

    // Balance should be $0 — inventory allocated but no payment
    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(0);
  });

  it("balance reflects only paid orders in mixed scenario", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 5);

    // Paid order: 2 × 200 × 0.85 = 340
    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/ps-10a",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    // Unpaid order: no balance impact
    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/ps-10b",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 200 }],
    });

    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(340); // only the paid order
  });
});

describe("order-queries.server — getOrderDetail", () => {
  it("returns order with items, summary, and timeline", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/detail-1",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/detail-1" } });
    const result = await getOrderDetail(order!.id);

    expect(result.order.items).toHaveLength(2);
    expect(result.summary.itemCount).toBe(2);
    expect(result.summary.refundedCount).toBe(0);
    expect(result.summary.totalFees).toBeCloseTo(60); // 2 × 200 × 0.15
    expect(result.summary.totalConsignorPayout).toBeCloseTo(340); // 2 × 200 × 0.85
    expect(result.timeline.length).toBeGreaterThanOrEqual(2); // created + paid (reverse-chronological)
    expect(result.timeline[0].label).toBe("Payment received");
    expect(result.timeline[1].label).toBe("Order created");
  });

  it("includes refund events in timeline", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/detail-2",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    });

    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/detail-2",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/detail-2" } });
    const result = await getOrderDetail(order!.id);

    expect(result.summary.refundedCount).toBe(1);
    expect(result.summary.totalFees).toBeCloseTo(30); // 1 sale fee (60) + 1 refund fee (-30) = 30
    const refundEvents = result.timeline.filter((e) => e.type === "refund");
    expect(refundEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("throws for non-existent order", async () => {
    await expect(getOrderDetail("nonexistent-id")).rejects.toThrow("Order not found");
  });

  it("returns correct data for unpaid order", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/detail-3",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 200 }],
    });

    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/detail-3" } });
    const result = await getOrderDetail(order!.id);

    expect(result.order.paymentStatus).toBe("pending");
    expect(result.summary.totalFees).toBe(0); // no transactions yet
    expect(result.summary.totalConsignorPayout).toBe(0);
    expect(result.timeline).toHaveLength(1); // only "Order created"
  });

  it("returns items with consignor and product info", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant, product } = await setupVariant();

    await createListings(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/detail-4",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 200 }],
      financialStatus: "paid",
    });

    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/detail-4" } });
    const result = await getOrderDetail(order!.id);

    const item = result.order.items[0];
    expect(item.listing.consignor.name).toBe(consignor.name);
    expect(item.listing.variant.product.title).toBe(product.title);
    expect(item.listing.variant.size).toBe(variant.size);
    expect(item.transactions).toHaveLength(1);
    expect(item.transactions[0].type).toBe("sale");
  });
});

// ── Post-Payout Refund Tests ────────────────────────────────────────────

describe("orders.server — post-payout refund handling", () => {
  /** Helper: create a sale, credit it, create a payout, mark it paid */
  async function setupPaidPayout(opts: {
    category?: string;
    feeRate?: number;
  } = {}) {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: opts.feeRate ?? 0.15 });

    const product = await prisma.product.create({
      data: {
        title: "Post-Payout Test Product",
        sku: `style-pp-${Date.now()}-${Math.random()}`,
        category: opts.category ?? "Footwear > Sneakers",
        shopifyProductId: `gid://shopify/Product/pp-${Date.now()}`,
      },
    });
    const variant = await prisma.variant.create({
      data: {
        productId: product.id,
        size: "10",
        shopifyVariantId: `gid://shopify/ProductVariant/pp-${Date.now()}`,
        inventoryItemId: `gid://shopify/InventoryItem/pp-${Date.now()}`,
      },
    });

    await createListings(consignor.id, variant.id, 200, 1);

    const shopifyOrderId = `gid://shopify/Order/pp-${Date.now()}`;
    await processOrder({
      admin,
      shopifyOrderId,
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 200 }],
      financialStatus: "paid",
    });

    // Find the sale transaction
    const order = await prisma.order.findUnique({
      where: { shopifyId: shopifyOrderId },
      include: { items: { include: { transactions: true } } },
    });
    const saleTx = order!.items[0].transactions.find((t) => t.type === "sale")!;

    // Create payout + payoutItem, mark paid
    const payout = await prisma.payout.create({
      data: {
        consignorId: consignor.id,
        amount: saleTx.consignorAmount,
        status: "paid",
        items: { create: { transactionId: saleTx.id } },
      },
    });

    return { admin, consignor, product, variant, order: order!, shopifyOrderId, saleTx, payout };
  }

  it("post-payout refund does NOT create negative transaction", async () => {
    const { admin, consignor, shopifyOrderId } = await setupPaidPayout();

    await refundOrder({ admin, shopifyOrderId });

    const txs = await prisma.transaction.findMany({ where: { consignorId: consignor.id } });
    expect(txs).toHaveLength(1); // only the original sale, no refund
    expect(txs[0].type).toBe("sale");
  });

  it("post-payout refund creates new listing under shop consignor", async () => {
    const { admin, consignor, variant, shopifyOrderId } = await setupPaidPayout({
      category: "Footwear > Sneakers",
    });

    await refundOrder({ admin, shopifyOrderId });

    // New listing should exist under a shop consignor
    const newListings = await prisma.listing.findMany({
      where: {
        variantId: variant.id,
        status: "active",
        reassignedFromConsignorId: consignor.id,
      },
    });
    expect(newListings).toHaveLength(1);
    expect(newListings[0].reassignedFromListingId).toBeTruthy();
    expect(newListings[0].price).toBe(200);
  });

  it("footwear items are reassigned to Kulture Klash", async () => {
    const { admin, shopifyOrderId } = await setupPaidPayout({
      category: "Footwear > Boots",
    });

    await refundOrder({ admin, shopifyOrderId });

    const shopConsignor = await prisma.consignor.findFirst({
      where: { name: "Kulture Klash" },
    });
    expect(shopConsignor).toBeTruthy();
    expect(shopConsignor!.feeRate).toBe(1.0);

    const reassigned = await prisma.listing.findFirst({
      where: { consignorId: shopConsignor!.id, status: "active" },
    });
    expect(reassigned).toBeTruthy();
  });

  it("non-footwear items are reassigned to Kulture Klothing", async () => {
    const { admin, shopifyOrderId } = await setupPaidPayout({
      category: "Apparel > Hoodies",
    });

    await refundOrder({ admin, shopifyOrderId });

    const shopConsignor = await prisma.consignor.findFirst({
      where: { name: "Kulture Klothing" },
    });
    expect(shopConsignor).toBeTruthy();
    expect(shopConsignor!.feeRate).toBe(1.0);

    const reassigned = await prisma.listing.findFirst({
      where: { consignorId: shopConsignor!.id, status: "active" },
    });
    expect(reassigned).toBeTruthy();
  });

  it("creates ReassignmentLog entry with full audit details", async () => {
    const { admin, consignor, order, shopifyOrderId } = await setupPaidPayout();

    await refundOrder({ admin, shopifyOrderId });

    const logs = await prisma.reassignmentLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].originalConsignorId).toBe(consignor.id);
    expect(logs[0].reason).toBe("post_payout_refund");
    expect(logs[0].orderId).toBe(order.id);
    expect(logs[0].newListingId).toBeTruthy();
    expect(logs[0].originalListingId).toBeTruthy();
  });

  it("original listing stays sold (not restored)", async () => {
    const { admin, order, shopifyOrderId } = await setupPaidPayout();
    const originalListingId = order.items[0].listingId;

    await refundOrder({ admin, shopifyOrderId });

    const originalListing = await prisma.listing.findUnique({ where: { id: originalListingId } });
    expect(originalListing!.status).toBe("sold"); // NOT restored to active
  });

  it("consignor balance unchanged after post-payout refund", async () => {
    const { admin, consignor, shopifyOrderId, payout } = await setupPaidPayout({ feeRate: 0.15 });

    const balanceBefore = await getConsignorBalance(consignor.id);
    // Balance = sale amount - paid payout = 170 - 170 = 0
    expect(balanceBefore).toBe(0);

    await refundOrder({ admin, shopifyOrderId });

    const balanceAfter = await getConsignorBalance(consignor.id);
    // No negative transaction created, so balance stays the same
    expect(balanceAfter).toBe(0);
  });

  it("normal refund (no paid payout) still creates negative transaction", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ feeRate: 0.15 });

    const product = await prisma.product.create({
      data: {
        title: "Normal Refund Product",
        sku: `style-nr-${Date.now()}-${Math.random()}`,
        category: "Footwear > Sneakers",
        shopifyProductId: `gid://shopify/Product/nr-${Date.now()}`,
      },
    });
    const variant = await prisma.variant.create({
      data: {
        productId: product.id,
        size: "9",
        shopifyVariantId: `gid://shopify/ProductVariant/nr-${Date.now()}`,
        inventoryItemId: `gid://shopify/InventoryItem/nr-${Date.now()}`,
      },
    });

    await createListings(consignor.id, variant.id, 200, 1);

    const shopifyOrderId = `gid://shopify/Order/nr-${Date.now()}`;
    await processOrder({
      admin,
      shopifyOrderId,
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 200 }],
      financialStatus: "paid",
    });

    // Refund WITHOUT any payout — normal path
    await refundOrder({ admin, shopifyOrderId });

    const txs = await prisma.transaction.findMany({
      where: { consignorId: consignor.id },
      orderBy: { createdAt: "asc" },
    });
    expect(txs).toHaveLength(2);
    expect(txs[0].type).toBe("sale");
    expect(txs[1].type).toBe("refund");
    expect(txs[1].amount).toBe(-170); // -200 * 0.85

    // Listing restored to active
    const listings = await prisma.listing.findMany({ where: { variantId: variant.id } });
    expect(listings[0].status).toBe("active");

    // No reassignment
    const logs = await prisma.reassignmentLog.findMany();
    expect(logs).toHaveLength(0);
  });

  it("shop consignor listing resale generates zero consignorAmount (100% fee)", async () => {
    const { admin, variant, shopifyOrderId } = await setupPaidPayout({
      category: "Footwear > Sneakers",
    });

    await refundOrder({ admin, shopifyOrderId });

    // Find the new listing under shop consignor
    const newListing = await prisma.listing.findFirst({
      where: { variantId: variant.id, status: "active" },
    });
    expect(newListing).toBeTruthy();

    const shopConsignor = await prisma.consignor.findUnique({
      where: { id: newListing!.consignorId },
    });
    expect(shopConsignor!.feeRate).toBe(1.0);

    // Simulate resale of the reassigned listing
    const resalePrice = 200;
    const grossAmount = resalePrice;
    const feeAmount = grossAmount * shopConsignor!.feeRate; // 200 * 1.0 = 200
    const consignorAmount = grossAmount - feeAmount; // 0

    expect(consignorAmount).toBe(0);
    expect(feeAmount).toBe(200); // marketplace keeps everything
  });

  it("cancelOrder with post-payout: reassigns instead of negative transaction", async () => {
    const { admin, consignor, shopifyOrderId } = await setupPaidPayout();

    await cancelOrder({ admin, shopifyOrderId });

    // No refund transaction
    const txs = await prisma.transaction.findMany({ where: { consignorId: consignor.id } });
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("sale");

    // Reassignment log created
    const logs = await prisma.reassignmentLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].reason).toBe("post_payout_refund");
  });
});
