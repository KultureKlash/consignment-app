import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import { processOrder, cancelOrder, refundOrder, getConsignorBalance } from "~/services/orders.server";

async function setupVariant(shopifyVariantId = "gid://shopify/ProductVariant/100") {
  const product = await prisma.product.create({
    data: {
      styleId: `style-${Date.now()}-${Math.random()}`,
      title: "Test Product",
      shopifyProductId: "gid://shopify/Product/1",
    },
  });
  const variant = await prisma.variant.create({
    data: {
      productId: product.id,
      size: "9",
      shopifyVariantId,
      inventoryItemId: "gid://shopify/InventoryItem/1",
    },
  });
  return { product, variant };
}

async function createListing(
  consignorId: string,
  variantId: string,
  price: number,
  quantity: number,
) {
  return prisma.listing.create({
    data: { consignorId, variantId, price, quantity, status: "active" },
  });
}

describe("orders.server — processOrder", () => {
  it("single listing partially fulfills order", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 350, 5);

    const order = await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/1",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    expect(order.total).toBe(700); // 350 * 2
    expect(order.status).toBe("open");

    // Listing should have 3 remaining, still active
    const listing = await prisma.listing.findFirst({ where: { variantId: variant.id } });
    expect(listing?.quantity).toBe(3);
    expect(listing?.status).toBe("active");

    // 1 order item
    expect(order.items).toHaveLength(1);
    expect(order.items[0].quantity).toBe(2);
    expect(order.items[0].price).toBe(350);
  });

  it("listing fully consumed becomes sold", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 350, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/2",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    const listing = await prisma.listing.findFirst({ where: { variantId: variant.id } });
    expect(listing?.quantity).toBe(0);
    expect(listing?.status).toBe("sold");
  });

  it("allocates lowest price first across multiple listings", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    // Listing A: cheaper, qty 1
    const listingA = await createListing(consignor.id, variant.id, 340, 1);
    // Listing B: more expensive, qty 2
    const listingB = await createListing(consignor.id, variant.id, 350, 2);

    const order = await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/3",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    // Should take all of A (1 unit at $340) then 1 from B (at $350)
    expect(order.total).toBe(690); // 340 + 350
    expect(order.items).toHaveLength(2);

    const updatedA = await prisma.listing.findUnique({ where: { id: listingA.id } });
    expect(updatedA?.quantity).toBe(0);
    expect(updatedA?.status).toBe("sold");

    const updatedB = await prisma.listing.findUnique({ where: { id: listingB.id } });
    expect(updatedB?.quantity).toBe(1);
    expect(updatedB?.status).toBe("active");
  });

  it("FIFO tiebreak when prices are equal", async () => {
    const { admin } = createMockAdmin();
    const consignor1 = await createTestConsignor({ email: "first@test.com" });
    const consignor2 = await createTestConsignor({ email: "second@test.com" });
    const { variant } = await setupVariant();

    // First listed (earlier createdAt)
    const listingFirst = await createListing(consignor1.id, variant.id, 350, 1);
    // Second listed (later createdAt)
    await createListing(consignor2.id, variant.id, 350, 1);

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

    await createListing(consignor.id, variant.id, 350, 2);

    await expect(
      processOrder({
        admin,
        shopifyOrderId: "gid://shopify/Order/5",
        lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 5, price: 350 }],
      })
    ).rejects.toThrow("Insufficient inventory");

    // Transaction should have rolled back — no order, no order items, no transactions
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.orderItem.count()).toBe(0);
    expect(await prisma.transaction.count()).toBe(0);

    // Listing should be unchanged
    const listing = await prisma.listing.findFirst({ where: { variantId: variant.id } });
    expect(listing?.quantity).toBe(2);
    expect(listing?.status).toBe("active");
  });

  it("creates transactions with correct commission and orderItemId", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 200, 3);

    const order = await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/6",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    const transactions = await prisma.transaction.findMany();
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe("sale");
    // amount = price * qty * commissionRate = 200 * 2 * 0.85 = 340
    expect(transactions[0].amount).toBe(340);
    expect(transactions[0].consignorId).toBe(consignor.id);
    expect(transactions[0].orderItemId).toBe(order.items[0].id);

    // Audit fields
    expect(transactions[0].salePrice).toBe(200);
    expect(transactions[0].quantity).toBe(2);
    expect(transactions[0].commissionRate).toBe(0.85);
    expect(transactions[0].grossAmount).toBe(400); // 200 * 2
    expect(transactions[0].commissionAmount).toBe(340); // 400 * 0.85
  });

  it("handles multiple line items (different variants)", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();

    const { variant: variant1 } = await setupVariant("gid://shopify/ProductVariant/200");
    const product2 = await prisma.product.create({
      data: { styleId: "STYLE-2", title: "Product 2", shopifyProductId: "gid://shopify/Product/2" },
    });
    const variant2 = await prisma.variant.create({
      data: {
        productId: product2.id,
        size: "10",
        shopifyVariantId: "gid://shopify/ProductVariant/201",
        inventoryItemId: "gid://shopify/InventoryItem/2",
      },
    });

    await createListing(consignor.id, variant1.id, 350, 3);
    await createListing(consignor.id, variant2.id, 450, 2);

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

    await createListing(consignor.id, variant.id, 350, 5);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/8",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    // Should have called inventorySetQuantities
    const setCalls = findCalls("inventorySetQuantities");
    expect(setCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("transaction captures commission rate snapshot (rate change after sale)", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 300, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/snapshot-test",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 300 }],
    });

    // Change the consignor's rate AFTER the sale
    await prisma.consignor.update({
      where: { id: consignor.id },
      data: { commissionRate: 0.70 },
    });

    // The transaction should still reflect the ORIGINAL rate (0.85)
    const txs = await prisma.transaction.findMany({ where: { type: "sale" } });
    expect(txs).toHaveLength(1);
    expect(txs[0].commissionRate).toBe(0.85);
    expect(txs[0].commissionAmount).toBe(255); // 300 * 1 * 0.85
    expect(txs[0].amount).toBe(255);
  });

  it("idempotent: duplicate shopifyOrderId returns existing order", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 350, 5);

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

    // Listing should only have been deducted once
    const listing = await prisma.listing.findFirst({ where: { variantId: variant.id } });
    expect(listing?.quantity).toBe(4);
  });
});

describe("orders.server — cancelOrder", () => {
  it("restores listing quantity and re-activates sold listing", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    const listing = await createListing(consignor.id, variant.id, 350, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/10",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    // Listing should be sold
    const soldListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(soldListing?.status).toBe("sold");
    expect(soldListing?.quantity).toBe(0);

    // Cancel the order
    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/10" });

    // Listing should be restored
    const restored = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(restored?.quantity).toBe(2);
    expect(restored?.status).toBe("active");
  });

  it("creates void transactions when payment not captured (default)", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/11",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    // Sale transaction: 200 * 2 * 0.85 = 340
    const saleTxs = await prisma.transaction.findMany({ where: { type: "sale" } });
    expect(saleTxs).toHaveLength(1);
    expect(saleTxs[0].amount).toBe(340);

    // Cancel without financialStatus → void (payment never captured)
    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/11" });

    // Should create void transaction (not refund)
    const voidTxs = await prisma.transaction.findMany({ where: { type: "void" } });
    expect(voidTxs).toHaveLength(1);
    expect(voidTxs[0].amount).toBe(-340);

    // Audit fields mirror the sale but negated amounts
    expect(voidTxs[0].salePrice).toBe(200);
    expect(voidTxs[0].quantity).toBe(2);
    expect(voidTxs[0].commissionRate).toBe(0.85);
    expect(voidTxs[0].grossAmount).toBe(-400);
    expect(voidTxs[0].commissionAmount).toBe(-340);

    // No refund transactions should exist
    const refundTxs = await prisma.transaction.findMany({ where: { type: "refund" } });
    expect(refundTxs).toHaveLength(0);

    // Net should be zero
    const allTxs = await prisma.transaction.findMany();
    const net = allTxs.reduce((sum, t) => sum + t.amount, 0);
    expect(net).toBe(0);
  });

  it("creates refund transactions when payment was captured", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/11b",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    // Cancel with financialStatus "paid" → refund (payment was captured)
    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/11b", financialStatus: "paid" });

    // Should create refund transaction (not void)
    const refundTxs = await prisma.transaction.findMany({ where: { type: "refund" } });
    expect(refundTxs).toHaveLength(1);
    expect(refundTxs[0].amount).toBe(-340);

    // No void transactions
    const voidTxs = await prisma.transaction.findMany({ where: { type: "void" } });
    expect(voidTxs).toHaveLength(0);

    // Net should be zero
    const allTxs = await prisma.transaction.findMany();
    const net = allTxs.reduce((sum, t) => sum + t.amount, 0);
    expect(net).toBe(0);
  });

  it("authorized financial status creates void transactions", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 350, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/11c",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
    });

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/11c", financialStatus: "authorized" });

    const voidTxs = await prisma.transaction.findMany({ where: { type: "void" } });
    expect(voidTxs).toHaveLength(1);
  });

  it("sets order status to cancelled", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 350, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/12",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
    });

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/12" });

    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/12" } });
    expect(order?.status).toBe("cancelled");
  });

  it("marks all order items as fully refunded", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 350, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/13",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/13" });

    const items = await prisma.orderItem.findMany();
    expect(items.every((i) => i.quantityRefunded >= i.quantity)).toBe(true);
  });

  it("syncs inventory back to Shopify after cancel", async () => {
    const { admin, findCalls } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 350, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/14",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
    });

    const callsBefore = findCalls("inventorySetQuantities").length;

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/14" });

    // Should have synced inventory again after cancel
    const callsAfter = findCalls("inventorySetQuantities").length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });

  it("throws if order already cancelled", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 350, 1);

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

    await createListing(consignor.id, variant.id, 350, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/16",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
    });

    // Shopify fires refunds/create first when cancelling with "Refund payment"
    await refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/16" });

    let order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/16" } });
    expect(order?.status).toBe("refunded");

    // Then orders/cancelled arrives — should NOT throw, just update status
    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/16" });

    order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/16" } });
    expect(order?.status).toBe("cancelled");

    // No double inventory restore — listing should have qty 1 (restored by refund only)
    const listing = await prisma.listing.findFirst({ where: { variantId: variant.id } });
    expect(listing?.quantity).toBe(1);
  });

  it("restores multiple listings from multi-listing order", async () => {
    const { admin } = createMockAdmin();
    const consignor1 = await createTestConsignor({ email: "a@test.com" });
    const consignor2 = await createTestConsignor({ email: "b@test.com" });
    const { variant } = await setupVariant();

    const listing1 = await createListing(consignor1.id, variant.id, 340, 1);
    const listing2 = await createListing(consignor2.id, variant.id, 350, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/17",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    // listing1 should be sold (took 1), listing2 should have 1 left
    expect((await prisma.listing.findUnique({ where: { id: listing1.id } }))?.status).toBe("sold");
    expect((await prisma.listing.findUnique({ where: { id: listing2.id } }))?.quantity).toBe(1);

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/17" });

    // Both listings should be restored
    const restored1 = await prisma.listing.findUnique({ where: { id: listing1.id } });
    expect(restored1?.quantity).toBe(1);
    expect(restored1?.status).toBe("active");

    const restored2 = await prisma.listing.findUnique({ where: { id: listing2.id } });
    expect(restored2?.quantity).toBe(2);
    expect(restored2?.status).toBe("active");
  });
});

describe("orders.server — refundOrder", () => {
  it("full refund restores all items and sets status to refunded", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    const listing = await createListing(consignor.id, variant.id, 350, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/20",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    await refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/20" });

    // Listing restored
    const restored = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(restored?.quantity).toBe(2);
    expect(restored?.status).toBe("active");

    // Order status
    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/20" } });
    expect(order?.status).toBe("refunded");
  });

  it("partial refund restores only specified items", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();

    const { variant: variant1 } = await setupVariant("gid://shopify/ProductVariant/300");
    const product2 = await prisma.product.create({
      data: { styleId: "STYLE-PARTIAL", title: "Product 2", shopifyProductId: "gid://shopify/Product/2" },
    });
    const variant2 = await prisma.variant.create({
      data: {
        productId: product2.id,
        size: "10",
        shopifyVariantId: "gid://shopify/ProductVariant/301",
        inventoryItemId: "gid://shopify/InventoryItem/2",
      },
    });

    const listing1 = await createListing(consignor.id, variant1.id, 350, 2);
    const listing2 = await createListing(consignor.id, variant2.id, 450, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/21",
      lineItems: [
        { shopifyVariantId: "gid://shopify/ProductVariant/300", quantity: 2, price: 350 },
        { shopifyVariantId: "gid://shopify/ProductVariant/301", quantity: 1, price: 450 },
      ],
    });

    // Partial refund: only variant1
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/21",
      refundLineItems: [
        { shopifyVariantId: "gid://shopify/ProductVariant/300", quantity: 2 },
      ],
    });

    // listing1 should be restored
    const restored1 = await prisma.listing.findUnique({ where: { id: listing1.id } });
    expect(restored1?.quantity).toBe(2);
    expect(restored1?.status).toBe("active");

    // listing2 should still be sold
    const unchanged2 = await prisma.listing.findUnique({ where: { id: listing2.id } });
    expect(unchanged2?.quantity).toBe(0);
    expect(unchanged2?.status).toBe("sold");
  });

  it("partial refund keeps order open until all items refunded", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();

    const { variant: variant1 } = await setupVariant("gid://shopify/ProductVariant/400");
    const product2 = await prisma.product.create({
      data: { styleId: "STYLE-OPEN", title: "Product 2", shopifyProductId: "gid://shopify/Product/2" },
    });
    const variant2 = await prisma.variant.create({
      data: {
        productId: product2.id,
        size: "10",
        shopifyVariantId: "gid://shopify/ProductVariant/401",
        inventoryItemId: "gid://shopify/InventoryItem/2",
      },
    });

    await createListing(consignor.id, variant1.id, 350, 1);
    await createListing(consignor.id, variant2.id, 450, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/22",
      lineItems: [
        { shopifyVariantId: "gid://shopify/ProductVariant/400", quantity: 1, price: 350 },
        { shopifyVariantId: "gid://shopify/ProductVariant/401", quantity: 1, price: 450 },
      ],
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

    // Refund the second item
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/22",
      refundLineItems: [
        { shopifyVariantId: "gid://shopify/ProductVariant/401", quantity: 1 },
      ],
    });

    // Now order should be refunded
    const finalOrder = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/22" } });
    expect(finalOrder?.status).toBe("refunded");
  });

  it("creates correct refund transactions per item", async () => {
    const { admin } = createMockAdmin();
    const consignor1 = await createTestConsignor({ email: "c1@test.com", commissionRate: 0.85 });
    const consignor2 = await createTestConsignor({ email: "c2@test.com", commissionRate: 0.80 });
    const { variant } = await setupVariant();

    await createListing(consignor1.id, variant.id, 340, 1);
    await createListing(consignor2.id, variant.id, 350, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/23",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    await refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/23" });

    const refundTxs = await prisma.transaction.findMany({
      where: { type: "refund" },
      orderBy: { amount: "asc" },
    });
    expect(refundTxs).toHaveLength(2);

    // consignor1: -(340 * 1 * 0.85) = -289
    // consignor2: -(350 * 1 * 0.80) = -280
    const amounts = refundTxs.map((t) => t.amount).sort((a, b) => a - b);
    expect(amounts[0]).toBe(-289); // consignor1
    expect(amounts[1]).toBe(-280); // consignor2

    // Net should be zero
    const allTxs = await prisma.transaction.findMany();
    const net = allTxs.reduce((sum, t) => sum + t.amount, 0);
    expect(Math.abs(net)).toBeLessThan(0.001); // floating point safety
  });

  it("throws if order is cancelled", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 350, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/24",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
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

    await createListing(consignor.id, variant.id, 350, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/25",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 350 }],
    });

    await refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/25" });

    await expect(
      refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/25" })
    ).rejects.toThrow("already fully refunded");
  });

  it("partial quantity refund uses in-place quantityRefunded (no item splitting)", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    const listing = await createListing(consignor.id, variant.id, 350, 5);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/26",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 3, price: 350 }],
    });

    // Refund 1 of the 3
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/26",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1 },
      ],
    });

    // Listing should get 1 back (was 2 after order, now 3)
    const updated = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(updated?.quantity).toBe(3);

    // Should have single order item with quantityRefunded = 1 (no splitting)
    const items = await prisma.orderItem.findMany();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
    expect(items[0].quantityRefunded).toBe(1);

    // Refund transaction for 1 unit: -(350 * 1 * 0.85) = -297.5
    const refundTxs = await prisma.transaction.findMany({ where: { type: "refund" } });
    expect(refundTxs).toHaveLength(1);
    expect(refundTxs[0].amount).toBe(-297.5);

    // Partial refund audit fields
    expect(refundTxs[0].salePrice).toBe(350);
    expect(refundTxs[0].quantity).toBe(1);
    expect(refundTxs[0].commissionRate).toBe(0.85);
    expect(refundTxs[0].grossAmount).toBe(-350);
    expect(refundTxs[0].commissionAmount).toBe(-297.5);

    // Order should still be open (2 units not refunded)
    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/26" } });
    expect(order?.status).toBe("open");
    // Order total should reflect only un-refunded units: 350 * 2 = 700
    expect(order?.total).toBe(700);
  });

  it("order total recalculates to 0 after full refund", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 350, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/total-full",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 350 }],
    });

    let order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/total-full" } });
    expect(order?.total).toBe(700);

    await refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/total-full" });

    order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/total-full" } });
    expect(order?.total).toBe(0);
    expect(order?.status).toBe("refunded");
  });

  it("order total recalculates correctly after partial refund on multi-item order", async () => {
    const { admin } = createMockAdmin();
    const consignor1 = await createTestConsignor({ email: "t1@test.com" });
    const consignor2 = await createTestConsignor({ email: "t2@test.com" });
    const { variant } = await setupVariant();

    await createListing(consignor1.id, variant.id, 340, 1);
    await createListing(consignor2.id, variant.id, 450, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/total-partial",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 340 }],
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

    await createListing(consignor.id, variant.id, 350, 2);

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

  // === NEW TESTS: Infallible Refund System ===

  it("chained partial refunds: refund 1 → 1 → 1 from qty 3", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    const listing = await createListing(consignor.id, variant.id, 200, 5);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/chain-1",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 3, price: 200 }],
    });

    // Refund 1
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/chain-1",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    let items = await prisma.orderItem.findMany();
    expect(items).toHaveLength(1);
    expect(items[0].quantityRefunded).toBe(1);

    let order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/chain-1" } });
    expect(order?.status).toBe("open");

    // Refund 1 more
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/chain-1",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    items = await prisma.orderItem.findMany();
    expect(items[0].quantityRefunded).toBe(2);

    order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/chain-1" } });
    expect(order?.status).toBe("open");

    // Refund last 1
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/chain-1",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    items = await prisma.orderItem.findMany();
    expect(items[0].quantityRefunded).toBe(3);

    order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/chain-1" } });
    expect(order?.status).toBe("refunded");

    // All 3 units restored to listing
    const updated = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(updated?.quantity).toBe(5); // original 5 restored

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

    await createListing(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/over-refund",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
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

    // Verify state unchanged after rejection (1 refunded, 1 remaining)
    const items = await prisma.orderItem.findMany();
    expect(items).toHaveLength(1);
    expect(items[0].quantityRefunded).toBe(1);
  });

  it("reverse priority: refunds most expensive listing first", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    // Create two listings at different prices
    const cheapListing = await createListing(consignor.id, variant.id, 200, 1);
    const expensiveListing = await createListing(consignor.id, variant.id, 220, 1);

    // Buy both (allocates cheapest first: $200 then $220)
    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/reverse-prio",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 220 }],
    });

    // Verify both listings sold
    expect((await prisma.listing.findUnique({ where: { id: cheapListing.id } }))?.quantity).toBe(0);
    expect((await prisma.listing.findUnique({ where: { id: expensiveListing.id } }))?.quantity).toBe(0);

    // Refund 1 unit — should refund the $220 listing first (reverse priority)
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/reverse-prio",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    // Expensive listing should be restored, cheap listing still sold
    const updatedExpensive = await prisma.listing.findUnique({ where: { id: expensiveListing.id } });
    expect(updatedExpensive?.quantity).toBe(1);
    expect(updatedExpensive?.status).toBe("active");

    const updatedCheap = await prisma.listing.findUnique({ where: { id: cheapListing.id } });
    expect(updatedCheap?.quantity).toBe(0);
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
    const olderListing = await createListing(consignor1.id, variant.id, 300, 1);
    const newerListing = await createListing(consignor2.id, variant.id, 300, 1);

    // Buy both (purchase allocates oldest first)
    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/tiebreak",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 300 }],
    });

    // Refund 1 — should refund the NEWER listing first (reverse tiebreak)
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/tiebreak",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    // Newer listing restored, older still sold
    const updatedNewer = await prisma.listing.findUnique({ where: { id: newerListing.id } });
    expect(updatedNewer?.quantity).toBe(1);
    expect(updatedNewer?.status).toBe("active");

    const updatedOlder = await prisma.listing.findUnique({ where: { id: olderListing.id } });
    expect(updatedOlder?.quantity).toBe(0);
    expect(updatedOlder?.status).toBe("sold");
  });

  it("chained partial refunds with balance tracking", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 200, 5);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/chain-balance",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 3, price: 200 }],
    });

    // Sale: 200 * 3 * 0.85 = 510
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

  it("cancel partially-refunded order: restores only remaining units", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    const listing = await createListing(consignor.id, variant.id, 200, 5);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/cancel-partial",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    // Listing: 5 - 2 = 3
    expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.quantity).toBe(3);

    // Refund 1 of 2
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/cancel-partial",
      refundLineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1 }],
    });

    // Listing: 3 + 1 = 4
    expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.quantity).toBe(4);

    // Cancel the order — should only restore the remaining 1 un-refunded unit
    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/cancel-partial" });

    // Listing: 4 + 1 = 5 (fully restored)
    const finalListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(finalListing?.quantity).toBe(5);

    // Order item should be fully refunded
    const items = await prisma.orderItem.findMany();
    expect(items).toHaveLength(1);
    expect(items[0].quantityRefunded).toBe(2); // all units accounted for

    // Net balance should be zero
    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(0);
  });
});

describe("orders.server — refundOrder restock handling", () => {
  it("no_restock refund skips inventory restore but creates transaction", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    const listing = await createListing(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/no-restock-1",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    // Listing: 3 - 2 = 1
    expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.quantity).toBe(1);

    // Refund 1 with no_restock (damaged/goodwill)
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/no-restock-1",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1, restockType: "no_restock" },
      ],
    });

    // Listing should NOT be restored — still 1
    const updated = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(updated?.quantity).toBe(1);

    // But quantityRefunded should be incremented
    const items = await prisma.orderItem.findMany();
    expect(items[0].quantityRefunded).toBe(1);

    // Refund transaction should exist
    const refundTxs = await prisma.transaction.findMany({ where: { type: "refund" } });
    expect(refundTxs).toHaveLength(1);
    expect(refundTxs[0].amount).toBe(-170); // 200 * 1 * 0.85

    // Balance should be reduced
    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(170); // 340 - 170
  });

  it("return refund restores inventory", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    const listing = await createListing(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/return-1",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    // Listing: 3 - 2 = 1
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/return-1",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1, restockType: "return" },
      ],
    });

    // Listing should be restored: 1 + 1 = 2
    const updated = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(updated?.quantity).toBe(2);
    expect(updated?.status).toBe("active");

    const items = await prisma.orderItem.findMany();
    expect(items[0].quantityRefunded).toBe(1);
  });

  it("no_restock full refund sets order to refunded without restoring inventory", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    const listing = await createListing(consignor.id, variant.id, 200, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/no-restock-full",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 200 }],
    });

    // Listing sold: qty 0
    expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.quantity).toBe(0);

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

    // But listing should still be qty 0 — no ghost inventory
    const updated = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(updated?.quantity).toBe(0);
  });

  it("mixed restock types: return + no_restock in chained refunds", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    const listing = await createListing(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/mixed-restock",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    // Listing: 3 - 2 = 1

    // Refund 1 with return (restore inventory)
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/mixed-restock",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1, restockType: "return" },
      ],
    });

    // Listing: 1 + 1 = 2
    expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.quantity).toBe(2);

    // Refund 1 with no_restock (do NOT restore)
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/mixed-restock",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1, restockType: "no_restock" },
      ],
    });

    // Listing should still be 2 — no_restock did NOT add inventory
    expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.quantity).toBe(2);

    // Order should be fully refunded
    const order = await prisma.order.findUnique({ where: { shopifyId: "gid://shopify/Order/mixed-restock" } });
    expect(order?.status).toBe("refunded");

    // quantityRefunded should be 2
    const items = await prisma.orderItem.findMany();
    expect(items[0].quantityRefunded).toBe(2);
  });

  it("default restockType is return (backward compat)", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    const listing = await createListing(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/default-restock",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 200 }],
    });

    // Listing: 2 - 1 = 1. Refund without specifying restockType
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/default-restock",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1 },
      ],
    });

    // Should restore inventory (default = "return")
    const updated = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(updated?.quantity).toBe(2);
  });

  it("duplicate refund webhook does not double-restore inventory", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant();

    const listing = await createListing(consignor.id, variant.id, 200, 1);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/dup-refund",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 200 }],
    });

    // First refund: restore inventory
    await refundOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/dup-refund",
      refundLineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1, restockType: "return" },
      ],
    });

    // Listing restored: 0 + 1 = 1
    expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.quantity).toBe(1);

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
    expect((await prisma.listing.findUnique({ where: { id: listing.id } }))?.quantity).toBe(1);
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
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/30",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    // 200 * 2 * 0.85 = 340
    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(340);
  });

  it("returns 0 after order + full refund", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/31",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    await refundOrder({ admin, shopifyOrderId: "gid://shopify/Order/31" });

    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(0);
  });

  it("returns partial amount after order + partial refund", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/32",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 3, price: 200 }],
    });

    // Sale: 200 * 3 * 0.85 = 510
    // Refund 1 unit: -(200 * 1 * 0.85) = -170
    // Balance should be 510 - 170 = 340
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
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 200, 3);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/33",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    // Sale: 200 * 2 * 0.85 = 340

    // Create a completed payout of $100
    await prisma.payout.create({
      data: { consignorId: consignor.id, amount: 100, status: "completed" },
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
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 200, 2);

    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/34",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
    });

    await cancelOrder({ admin, shopifyOrderId: "gid://shopify/Order/34" });

    const balance = await getConsignorBalance(consignor.id);
    expect(balance).toBe(0);
  });
});
