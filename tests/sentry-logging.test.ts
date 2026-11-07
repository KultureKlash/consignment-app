import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// Capture what reaches @sentry/node without a real DSN round-trip.
const captured: Array<{
  error: unknown;
  message?: string;
  tags: Record<string, string>;
  extras: Record<string, unknown>;
  level?: string;
}> = [];
const capturedMessages: Array<{ message: string; tags: Record<string, string>; extras: Record<string, unknown> }> = [];
let flushCalls = 0;
let initCalls = 0;

vi.mock("@sentry/node", () => {
  type Scope = {
    setTag: (k: string, v: string) => void;
    setExtras: (e: Record<string, unknown>) => void;
    setExtra: (k: string, v: unknown) => void;
    setLevel: (l: string) => void;
  };
  let current: { tags: Record<string, string>; extras: Record<string, unknown>; level?: string } | null = null;

  const scope: Scope = {
    setTag: (k, v) => { current!.tags[k] = v; },
    setExtras: (e) => { Object.assign(current!.extras, e); },
    setExtra: (k, v) => { current!.extras[k] = v; },
    setLevel: (l) => { current!.level = l; },
  };

  return {
    init: () => { initCalls++; },
    withScope: (fn: (s: Scope) => void) => {
      current = { tags: {}, extras: {} };
      fn(scope);
    },
    captureException: (error: unknown) => {
      captured.push({
        error,
        message: current?.extras.logMessage as string | undefined,
        tags: { ...current!.tags },
        extras: { ...current!.extras },
        level: current!.level,
      });
    },
    captureMessage: (message: string) => {
      capturedMessages.push({ message, tags: { ...current!.tags }, extras: { ...current!.extras } });
    },
    flush: async () => { flushCalls++; return true; },
  };
});

// The Sentry module reads SENTRY_DSN at call time and no-ops without it.
process.env.SENTRY_DSN = "https://test@example.ingest.sentry.io/1";

const { logger } = await import("~/lib/system/logger.server");
const { flushSentry, captureException } = await import("~/lib/system/sentry.server");
const { createWebhookHandler } = await import("~/services/webhooks");

vi.mock("~/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(async () => ({
      shop: "kulture-konsign-dev.myshopify.com",
      topic: "orders/create",
      payload: { id: 7001, name: "#KK7001" },
    })),
  },
}));

beforeEach(() => {
  captured.length = 0;
  capturedMessages.length = 0;
  flushCalls = 0;
});

afterAll(() => {
  delete process.env.SENTRY_DSN;
});

describe("logger.error -> Sentry", () => {
  it("captures the original Error with its stack, not a message string", async () => {
    const boom = new Error("database connection lost");
    await logger.error("Something failed", { error: boom });

    expect(capturedMessages).toHaveLength(0); // captureMessage must not be used
    expect(captured).toHaveLength(1);
    expect(captured[0].error).toBe(boom); // the same object, not a copy or a string
    expect((captured[0].error as Error).stack).toContain("database connection lost");
    expect((captured[0].error as Error).stack).toContain("sentry-logging.test");
    expect(captured[0].level).toBe("error");
  });

  it("promotes topic, shop, shopifyEventId and orderId to tags", async () => {
    await logger.error("Webhook processing failed", {
      topic: "orders/create",
      shop: "kulture-konsign-dev.myshopify.com",
      shopifyEventId: "evt-abc",
      orderId: "gid://shopify/Order/7001",
      error: new Error("boom"),
    });

    expect(captured[0].tags).toEqual({
      topic: "orders/create",
      shop: "kulture-konsign-dev.myshopify.com",
      shopifyEventId: "evt-abc",
      orderId: "gid://shopify/Order/7001",
    });
  });

  it("keeps non-tag meta as extras and records the log message", async () => {
    await logger.error("Shopify sync failed", {
      topic: "orders/create",
      variantId: "var_123",
      attempt: 3,
      error: new Error("429"),
    });

    expect(captured[0].tags).toEqual({ topic: "orders/create" });
    expect(captured[0].extras.variantId).toBe("var_123");
    expect(captured[0].extras.attempt).toBe(3);
    expect(captured[0].message).toBe("Shopify sync failed");
  });

  it("omits tags whose value is missing", async () => {
    await logger.error("Partial context", {
      topic: "orders/paid",
      shop: undefined,
      orderId: "",
      error: new Error("x"),
    });

    expect(captured[0].tags).toEqual({ topic: "orders/paid" });
  });

  it("falls back to captureMessage only when there is no Error", async () => {
    await logger.error("Shopify returned userErrors", { errors: [{ message: "bad" }] });

    expect(captured).toHaveLength(0);
    expect(capturedMessages).toHaveLength(1);
    expect(capturedMessages[0].message).toBe("Shopify returned userErrors");
  });

  it("does not report info or warn as exceptions", async () => {
    logger.info("fine", { topic: "orders/create" });
    logger.warn("hmm", { topic: "orders/create", error: new Error("retrying") });
    // Flush any microtasks the logger may have queued.
    await Promise.resolve();

    expect(captured).toHaveLength(0);
    expect(capturedMessages).toHaveLength(0);
  });

  it("keeps capturing after the first event", async () => {
    // Regression guard: ensureInit used to return null once initialized, so only
    // the first error of a process lifetime ever reached Sentry.
    await logger.error("first", { error: new Error("one") });
    await logger.error("second", { error: new Error("two") });
    await logger.error("third", { error: new Error("three") });

    expect(captured.map((c) => (c.error as Error).message)).toEqual(["one", "two", "three"]);
    expect(initCalls).toBe(1); // init stays single-shot
  });

  it("never throws when Sentry itself fails", async () => {
    await expect(captureException(new Error("ok"), { tags: { topic: "t" } })).resolves.toBeUndefined();
  });
});

describe("webhook handler failure -> Sentry", () => {
  it("captures a stack and all four tags, and flushes before returning 500", async () => {
    const thrown = new Error("Shopify inventorySetQuantities failed");

    const action = createWebhookHandler({
      idPrefix: "order",
      handler: async () => {
        throw thrown;
      },
    });

    const response = await action({
      request: new Request("http://localhost/webhooks/orders/create", {
        method: "POST",
        headers: { "X-Shopify-Webhook-Id": "evt-sentry-500" },
      }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(500);

    // One captured exception, carrying the real error and its stack.
    expect(captured).toHaveLength(1);
    expect(captured[0].error).toBe(thrown);
    expect((captured[0].error as Error).stack).toBeTruthy();
    expect((captured[0].error as Error).stack).toContain("Shopify inventorySetQuantities failed");

    // All four required tags, from the wrapper's own context.
    expect(captured[0].tags).toEqual({
      topic: "orders/create",
      shop: "kulture-konsign-dev.myshopify.com",
      shopifyEventId: "evt-sentry-500",
      orderId: "gid://shopify/Order/7001",
    });

    // Fire-and-forget capture would be lost when the response is flushed.
    expect(flushCalls).toBeGreaterThan(0);

    // And the constant log line is not what Sentry groups on any more.
    expect(capturedMessages).toHaveLength(0);
  });

  it("captures nothing on a successful webhook", async () => {
    const action = createWebhookHandler({ idPrefix: "order", handler: async () => {} });

    const response = await action({
      request: new Request("http://localhost/webhooks/orders/create", {
        method: "POST",
        headers: { "X-Shopify-Webhook-Id": "evt-sentry-200" },
      }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);
    expect(captured).toHaveLength(0);
  });
});

describe("flushSentry", () => {
  it("resolves even when called repeatedly", async () => {
    await flushSentry(10);
    await flushSentry(10);
    expect(flushCalls).toBe(2);
  });
});
