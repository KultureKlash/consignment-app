import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import { processOrder } from "~/services/orders.server";

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

  it("creates transactions with correct commission amounts", async () => {
    const { admin } = createMockAdmin();
    const consignor = await createTestConsignor({ commissionRate: 0.85 });
    const { variant } = await setupVariant();

    await createListing(consignor.id, variant.id, 200, 3);

    await processOrder({
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
