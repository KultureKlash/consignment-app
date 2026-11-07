import { describe, it, expect, vi } from "vitest";
import { prisma, createTestConsignor, money } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import { withWebhookDedup, createWebhookHandler } from "~/services/webhooks";
import { processOrder, creditOrder, getConsignorBalance } from "~/services/orders";
import { calculateFee } from "~/lib/fee-calc";

// createWebhookHandler dynamically imports ~/shopify.server for authenticate.webhook.
// Stub it so the wrapper's status-code contract can be tested without Shopify.
vi.mock("~/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(async () => ({
      shop: "test-shop.myshopify.com",
      topic: "orders/create",
      payload: { id: 5550001 },
    })),
  },
}));

async function setupVariant(shopifyVariantId = "gid://shopify/ProductVariant/700") {
  const product = await prisma.product.create({
    data: {
      sku: `style-${Date.now()}-${Math.random()}`,
      title: "Webhook Test Product",
      shopifyProductId: "gid://shopify/Product/70",
    },
  });
  const variant = await prisma.variant.create({
    data: {
      productId: product.id,
      size: "10",
      gtin: `GTIN-${Date.now()}`,
      shopifyVariantId,
      inventoryItemId: "gid://shopify/InventoryItem/70",
    },
  });
  return { product, variant };
}

/** Per-item listing model: one row per physical item. */
async function createListings(consignorId: string, variantId: string, price: number, count: number) {
  const listings = [];
  for (let i = 0; i < count; i++) {
    listings.push(
      await prisma.listing.create({
        data: { consignorId, variantId, price, status: "active" },
      }),
    );
  }
  return listings;
}

function makeRequest(webhookId: string) {
  return {
    request: new Request("http://localhost/webhooks/orders/create", {
      method: "POST",
      headers: { "X-Shopify-Webhook-Id": webhookId },
    }),
    params: {},
    context: {},
  } as never;
}

describe("webhooks.server — withWebhookDedup", () => {
  it("processes new events and marks them completed", async () => {
    let called = false;
    const result = await withWebhookDedup(
      "evt-1",
      "orders/create",
      "gid://shopify/Order/1",
      async () => {
        called = true;
        return "processed";
      },
    );

    expect(called).toBe(true);
    expect(result).toBe("processed");

    const event = await prisma.webhookEvent.findUnique({
      where: { shopifyEventId: "evt-1" },
    });
    expect(event?.status).toBe("completed");
    expect(event?.topic).toBe("orders/create");
    expect(event?.shopifyObjectId).toBe("gid://shopify/Order/1");
    expect(event?.processedAt).toBeTruthy();
  });

  it("skips already-completed events", async () => {
    // First call
    await withWebhookDedup("evt-2", "orders/create", "gid://shopify/Order/2", async () => "first");

    // Second call with same event ID
    let called = false;
    const result = await withWebhookDedup("evt-2", "orders/create", "gid://shopify/Order/2", async () => {
      called = true;
      return "second";
    });

    expect(called).toBe(false);
    expect(result).toBeNull();

    // Only one event record should exist
    const events = await prisma.webhookEvent.findMany({
      where: { shopifyEventId: "evt-2" },
    });
    expect(events).toHaveLength(1);
  });

  it("stores error on failure and rethrows", async () => {
    await expect(
      withWebhookDedup("evt-3", "orders/create", "gid://shopify/Order/3", async () => {
        throw new Error("Something went wrong");
      }),
    ).rejects.toThrow("Something went wrong");

    const event = await prisma.webhookEvent.findUnique({
      where: { shopifyEventId: "evt-3" },
    });
    expect(event?.status).toBe("failed");
    expect(event?.error).toBe("Something went wrong");
    expect(event?.processedAt).toBeNull();
  });

  it("retries failed events", async () => {
    // First call fails
    await expect(
      withWebhookDedup("evt-4", "orders/create", "gid://shopify/Order/4", async () => {
        throw new Error("Temporary failure");
      }),
    ).rejects.toThrow("Temporary failure");

    // Retry succeeds
    const result = await withWebhookDedup("evt-4", "orders/create", "gid://shopify/Order/4", async () => "retried");

    expect(result).toBe("retried");

    const event = await prisma.webhookEvent.findUnique({
      where: { shopifyEventId: "evt-4" },
    });
    expect(event?.status).toBe("completed");
  });

  it("skips events still being processed (not stale)", async () => {
    // Manually create a "processing" event that is recent
    await prisma.webhookEvent.create({
      data: {
        shopifyEventId: "evt-5",
        topic: "orders/create",
        shopifyObjectId: "gid://shopify/Order/5",
        status: "processing",
      },
    });

    let called = false;
    const result = await withWebhookDedup("evt-5", "orders/create", "gid://shopify/Order/5", async () => {
      called = true;
      return "should not run";
    });

    expect(called).toBe(false);
    expect(result).toBeNull();
  });

  it("retries stale processing events (>5 min old)", async () => {
    // Create a "processing" event from 10 minutes ago
    const staleDate = new Date(Date.now() - 10 * 60 * 1000);
    await prisma.webhookEvent.create({
      data: {
        shopifyEventId: "evt-6",
        topic: "orders/create",
        shopifyObjectId: "gid://shopify/Order/6",
        status: "processing",
        createdAt: staleDate,
      },
    });

    let called = false;
    const result = await withWebhookDedup("evt-6", "orders/create", "gid://shopify/Order/6", async () => {
      called = true;
      return "retried stale";
    });

    expect(called).toBe(true);
    expect(result).toBe("retried stale");

    const event = await prisma.webhookEvent.findUnique({
      where: { shopifyEventId: "evt-6" },
    });
    expect(event?.status).toBe("completed");
  });

  it("records correct metadata on event", async () => {
    await withWebhookDedup("evt-7", "refunds/create", "gid://shopify/Refund/99", async () => "ok");

    const event = await prisma.webhookEvent.findUnique({
      where: { shopifyEventId: "evt-7" },
    });
    expect(event?.topic).toBe("refunds/create");
    expect(event?.shopifyObjectId).toBe("gid://shopify/Refund/99");
    expect(event?.error).toBeNull();
  });
});

describe("webhooks.server — createWebhookHandler status codes", () => {
  it("returns 200 when the handler succeeds", async () => {
    const action = createWebhookHandler({
      idPrefix: "order",
      handler: async () => {},
    });

    const response = await action(makeRequest("evt-ok-200"));

    expect(response.status).toBe(200);
    const event = await prisma.webhookEvent.findUnique({
      where: { shopifyEventId: "evt-ok-200" },
    });
    expect(event?.status).toBe("completed");
  });

  it("returns 500 on handler error so Shopify redelivers, and leaves the event retryable", async () => {
    const action = createWebhookHandler({
      idPrefix: "order",
      handler: async () => {
        throw new Error("Shopify API down");
      },
    });

    const response = await action(makeRequest("evt-fail-500"));

    // A 200 here made every transient failure permanent — nothing replays events.
    expect(response.status).toBe(500);

    const failed = await prisma.webhookEvent.findUnique({
      where: { shopifyEventId: "evt-fail-500" },
    });
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("Shopify API down");

    // Redelivery of the same event ID must re-run the handler, not dedup it away.
    let reran = false;
    const retry = createWebhookHandler({
      idPrefix: "order",
      handler: async () => {
        reran = true;
      },
    });
    const retryResponse = await retry(makeRequest("evt-fail-500"));

    expect(reran).toBe(true);
    expect(retryResponse.status).toBe(200);

    const events = await prisma.webhookEvent.findMany({
      where: { shopifyEventId: "evt-fail-500" },
    });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("completed");
  });
});

describe("processOrder — redelivery recovery", () => {
  it("completes the credit on redelivery after a Shopify inventory failure", async () => {
    const consignor = await createTestConsignor({ feeRate: 0.2 });
    const { variant } = await setupVariant();
    await createListings(consignor.id, variant.id, 300, 2);

    // First delivery: allocation commits, then syncInventory throws.
    const failing = createMockAdmin({ failOn: ["inventorySetQuantities"] });
    await expect(
      processOrder({
        admin: failing.admin,
        shopifyOrderId: "gid://shopify/Order/9001",
        lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 300 }],
        financialStatus: "paid",
      }),
    ).rejects.toThrow(/inventorySetQuantities/);

    // Order and allocation survived; crediting never ran.
    const afterFailure = await prisma.order.findUniqueOrThrow({
      where: { shopifyId: "gid://shopify/Order/9001" },
      include: { items: true },
    });
    expect(afterFailure.items).toHaveLength(1);
    expect(afterFailure.paymentStatus).toBe("pending");
    expect(await prisma.transaction.count({ where: { consignorId: consignor.id } })).toBe(0);
    expect((await getConsignorBalance(consignor.id)).toNumber()).toBe(0);

    // Redelivery with a healthy Shopify must finish the job, not return early.
    const healthy = createMockAdmin();
    const recovered = await processOrder({
      admin: healthy.admin,
      shopifyOrderId: "gid://shopify/Order/9001",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 300 }],
      financialStatus: "paid",
    });

    expect(recovered.paymentStatus).toBe("paid");
    expect(healthy.findCalls("inventorySetQuantities")).toHaveLength(1);

    const { consignorAmount } = calculateFee(300, 0.2);
    expect((await getConsignorBalance(consignor.id)).toNumber()).toBe(consignorAmount.toNumber());

    const sales = await prisma.transaction.findMany({
      where: { consignorId: consignor.id, type: "sale" },
    });
    expect(sales).toHaveLength(1);

    // No duplicate order rows, and the allocated listing settled to sold.
    expect(await prisma.order.count({ where: { shopifyId: "gid://shopify/Order/9001" } })).toBe(1);
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "sold" } })).toBe(1);
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(1);
  });

  it("credits once when the same paid order is delivered twice", async () => {
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant("gid://shopify/ProductVariant/701");
    await createListings(consignor.id, variant.id, 200, 3);

    const { admin } = createMockAdmin();
    const args = {
      admin,
      shopifyOrderId: "gid://shopify/Order/9002",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 2, price: 200 }],
      financialStatus: "paid",
    };

    await processOrder(args);
    await processOrder(args);

    const sales = await prisma.transaction.findMany({
      where: { consignorId: consignor.id, type: "sale" },
    });
    expect(sales).toHaveLength(2); // one per allocated item, not four

    const { consignorAmount } = calculateFee(200, 0.15);
    expect((await getConsignorBalance(consignor.id)).toNumber()).toBe(consignorAmount.times(2).toNumber());

    expect(await prisma.order.count({ where: { shopifyId: "gid://shopify/Order/9002" } })).toBe(1);
    expect(await prisma.orderItem.count()).toBe(2);
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "active" } })).toBe(1);
  });

  it("credits once when creditOrder is also called directly after processOrder", async () => {
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant("gid://shopify/ProductVariant/702");
    await createListings(consignor.id, variant.id, 150, 1);

    const { admin } = createMockAdmin();
    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/9003",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 150 }],
      financialStatus: "paid",
    });

    // The orders/paid webhook can arrive after orders/create already credited.
    await creditOrder({ shopifyOrderId: "gid://shopify/Order/9003" });

    const sales = await prisma.transaction.findMany({
      where: { consignorId: consignor.id, type: "sale" },
    });
    expect(sales).toHaveLength(1);

    const { consignorAmount } = calculateFee(150, 0.15);
    expect((await getConsignorBalance(consignor.id)).toNumber()).toBe(consignorAmount.toNumber());
  });
});

describe("processOrder — unmapped line items", () => {
  it("creates the order and flags the unmapped item instead of aborting", async () => {
    const consignor = await createTestConsignor({ feeRate: 0.15 });
    const { variant } = await setupVariant("gid://shopify/ProductVariant/703");
    await createListings(consignor.id, variant.id, 250, 1);

    const { admin } = createMockAdmin();
    const order = await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/9004",
      lineItems: [
        { shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 250 },
        // A gift card / product created outside this app — no local Variant row.
        { shopifyVariantId: "gid://shopify/ProductVariant/does-not-exist", quantity: 2, price: 25 },
      ],
      financialStatus: "paid",
    });

    // The consignment item settled normally.
    expect(order.items).toHaveLength(1);
    expect(money(order.total)).toBe(250); // unmapped item excluded from marketplace total
    expect(order.paymentStatus).toBe("paid");

    const { consignorAmount } = calculateFee(250, 0.15);
    expect((await getConsignorBalance(consignor.id)).toNumber()).toBe(consignorAmount.toNumber());
    expect(await prisma.listing.count({ where: { variantId: variant.id, status: "sold" } })).toBe(1);

    // And the unmapped line item is recorded for admin review.
    const stored = await prisma.order.findUniqueOrThrow({
      where: { shopifyId: "gid://shopify/Order/9004" },
    });
    const unmapped = stored.unmappedLineItems as Array<Record<string, unknown>>;
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]).toMatchObject({
      shopifyVariantId: "gid://shopify/ProductVariant/does-not-exist",
      quantity: 2,
      price: 25,
      reason: "variant_not_found",
    });
  });

  it("records the order when every line item is unmapped", async () => {
    const { admin } = createMockAdmin();
    const order = await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/9005",
      lineItems: [{ shopifyVariantId: "gid://shopify/ProductVariant/ghost", quantity: 1, price: 40 }],
    });

    expect(order.items).toHaveLength(0);
    expect(money(order.total)).toBe(0);

    const stored = await prisma.order.findUniqueOrThrow({
      where: { shopifyId: "gid://shopify/Order/9005" },
    });
    expect(stored.unmappedLineItems as unknown[]).toHaveLength(1);
  });

  it("leaves unmappedLineItems null when every line item maps", async () => {
    const consignor = await createTestConsignor();
    const { variant } = await setupVariant("gid://shopify/ProductVariant/704");
    await createListings(consignor.id, variant.id, 100, 1);

    const { admin } = createMockAdmin();
    await processOrder({
      admin,
      shopifyOrderId: "gid://shopify/Order/9006",
      lineItems: [{ shopifyVariantId: variant.shopifyVariantId!, quantity: 1, price: 100 }],
    });

    const stored = await prisma.order.findUniqueOrThrow({
      where: { shopifyId: "gid://shopify/Order/9006" },
    });
    expect(stored.unmappedLineItems).toBeNull();
  });
});
