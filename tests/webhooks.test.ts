import { describe, it, expect } from "vitest";
import { prisma } from "./setup";
import { withWebhookDedup } from "~/services/webhooks";

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
