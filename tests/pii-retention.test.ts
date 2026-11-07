import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "./setup";
import {
  RAW_PAYLOAD_RETENTION_DAYS,
  redactExpiredWebhookPayloads,
  redactCustomerWebhookPayloads,
  redactShopWebhookPayloads,
} from "~/services/retention";
import { createWebhookHandler } from "~/services/webhooks";

vi.mock("~/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(async () => ({
      shop: "kulture-konsign-dev.myshopify.com",
      topic: "customers/redact",
      payload: { customer: { id: 4242, email: "buyer@example.com" }, orders_to_redact: [8001] },
    })),
  },
}));

const REPO_ROOT = path.resolve(__dirname, "..");

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** Every file a consignor-facing request can reach. */
function consignorFacingFiles(): string[] {
  const files = [
    ...walk(path.join(REPO_ROOT, "app", "services", "portal")),
    ...walk(path.join(REPO_ROOT, "app", "components", "portal")),
  ];
  const routesDir = path.join(REPO_ROOT, "app", "routes");
  for (const f of walk(routesDir)) {
    if (path.basename(f).startsWith("portal")) files.push(f);
  }
  return files;
}

describe("PII — rawPayload is unreachable from the portal", () => {
  it("finds the portal surface so the scan below is not vacuously true", () => {
    const files = consignorFacingFiles();
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.includes("auth.server"))).toBe(true);
    expect(files.some((f) => path.basename(f).startsWith("portal."))).toBe(true);
  });

  it("no portal service, route, or component mentions rawPayload", () => {
    const offenders = consignorFacingFiles().filter((f) =>
      fs.readFileSync(f, "utf8").includes("rawPayload"),
    );
    expect(offenders.map((f) => path.relative(REPO_ROOT, f))).toEqual([]);
  });

  it("no portal code touches the WebhookEvent table at all", () => {
    // Stronger guard: without a webhookEvent query there is no way to select
    // the column, however a future loader is written.
    const offenders = consignorFacingFiles().filter((f) =>
      /webhookEvent/i.test(fs.readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => path.relative(REPO_ROOT, f))).toEqual([]);
  });

  it("is referenced only by the files allowed to handle PII", () => {
    // Allowlist with the reason each one qualifies. A new entry appearing here
    // is the signal to check whether that file should be touching PII at all.
    const ALLOWED = [
      "app/routes/cron.retention.tsx", // scheduled redaction
      "app/routes/webhooks.customers.data_request.tsx", // counts what we hold
      "app/routes/webhooks.customers.redact.tsx", // per-customer redaction
      "app/services/retention/retention.server.ts", // the redaction itself
      "app/services/webhooks/webhooks.server.ts", // the only writer
    ];

    const referencing = walk(path.join(REPO_ROOT, "app"))
      .filter((f) => fs.readFileSync(f, "utf8").includes("rawPayload"))
      .map((f) => path.relative(REPO_ROOT, f).split(path.sep).join("/"))
      .sort();

    expect(referencing).toEqual(ALLOWED);
  });
});

describe("PII — 90-day retention", () => {
  const PAYLOAD = { id: 8001, name: "#KK8001", customer: { id: 4242, email: "buyer@example.com" } };

  async function seedEvent(id: string, ageDays: number, payload: unknown = PAYLOAD) {
    return prisma.webhookEvent.create({
      data: {
        shopifyEventId: id,
        topic: "orders/create",
        shopifyObjectId: "gid://shopify/Order/8001",
        status: "completed",
        rawPayload: payload as never,
        createdAt: new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000),
      },
    });
  }

  it("uses a 90-day window", () => {
    expect(RAW_PAYLOAD_RETENTION_DAYS).toBe(90);
  });

  it("nulls the payload past the window but keeps the row for dedup and audit", async () => {
    const old = await seedEvent("evt-old", 91);

    const { redacted } = await redactExpiredWebhookPayloads();
    expect(redacted).toBe(1);

    const after = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: old.id } });
    expect(after.rawPayload).toBeNull();
    // Everything dedup and audit rely on survives.
    expect(after.shopifyEventId).toBe("evt-old");
    expect(after.topic).toBe("orders/create");
    expect(after.shopifyObjectId).toBe("gid://shopify/Order/8001");
    expect(after.status).toBe("completed");
  });

  it("leaves payloads inside the window alone", async () => {
    const recent = await seedEvent("evt-recent", 89);

    const { redacted } = await redactExpiredWebhookPayloads();
    expect(redacted).toBe(0);

    const after = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: recent.id } });
    expect(after.rawPayload).not.toBeNull();
  });

  it("is idempotent — a second run redacts nothing", async () => {
    await seedEvent("evt-a", 100);
    await seedEvent("evt-b", 120);

    expect((await redactExpiredWebhookPayloads()).redacted).toBe(2);
    expect((await redactExpiredWebhookPayloads()).redacted).toBe(0);
  });

  it("accepts an explicit window", async () => {
    await seedEvent("evt-30d", 31);

    expect((await redactExpiredWebhookPayloads(90)).redacted).toBe(0);
    expect((await redactExpiredWebhookPayloads(30)).redacted).toBe(1);
  });
});

describe("PII — customers/redact", () => {
  async function seedEvent(id: string, objectId: string, payload: unknown) {
    return prisma.webhookEvent.create({
      data: {
        shopifyEventId: id,
        topic: "orders/create",
        shopifyObjectId: objectId,
        status: "completed",
        rawPayload: payload as never,
      },
    });
  }

  it("redacts the orders Shopify names", async () => {
    const target = await seedEvent("evt-1", "gid://shopify/Order/9001", { id: 9001 });
    const other = await seedEvent("evt-2", "gid://shopify/Order/9002", { id: 9002 });

    const { redacted } = await redactCustomerWebhookPayloads({ orderIds: [9001] });
    expect(redacted).toBe(1);

    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: target.id } })).rawPayload).toBeNull();
    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: other.id } })).rawPayload).not.toBeNull();
  });

  it("also sweeps payloads whose embedded customer id matches", async () => {
    // An order Shopify did not list, but which still names the customer.
    const unlisted = await seedEvent("evt-3", "gid://shopify/Order/9003", {
      id: 9003,
      customer: { id: 4242, email: "buyer@example.com" },
    });
    const unrelated = await seedEvent("evt-4", "gid://shopify/Order/9004", {
      id: 9004,
      customer: { id: 7777 },
    });

    const { redacted } = await redactCustomerWebhookPayloads({ customerId: 4242 });
    expect(redacted).toBe(1);

    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: unlisted.id } })).rawPayload).toBeNull();
    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: unrelated.id } })).rawPayload).not.toBeNull();
  });

  it("accepts an order id already in gid form", async () => {
    const target = await seedEvent("evt-5", "gid://shopify/Order/9005", { id: 9005 });

    await redactCustomerWebhookPayloads({ orderIds: ["gid://shopify/Order/9005"] });

    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: target.id } })).rawPayload).toBeNull();
  });

  it("does nothing when given neither a customer nor orders", async () => {
    const kept = await seedEvent("evt-6", "gid://shopify/Order/9006", { id: 9006 });

    expect((await redactCustomerWebhookPayloads({})).redacted).toBe(0);
    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: kept.id } })).rawPayload).not.toBeNull();
  });

  it("does not store the redaction request's own payload", async () => {
    // The customers/redact payload names the customer being erased; persisting
    // it would create the PII the request exists to remove.
    const action = createWebhookHandler({
      idPrefix: "customers-redact",
      storePayload: false,
      getObjectId: (payload) => `gid://shopify/Customer/${payload.customer?.id}`,
      handler: async () => {},
    });

    const response = await action({
      request: new Request("http://localhost/webhooks/customers/redact", {
        method: "POST",
        headers: { "X-Shopify-Webhook-Id": "evt-redact-req" },
      }),
      params: {},
      context: {},
    } as never);

    expect(response.status).toBe(200);

    const event = await prisma.webhookEvent.findUniqueOrThrow({
      where: { shopifyEventId: "evt-redact-req" },
    });
    expect(event.rawPayload).toBeNull();
    expect(event.status).toBe("completed");
    expect(event.shopifyObjectId).toBe("gid://shopify/Customer/4242");
  });
});

describe("PII — shop/redact", () => {
  it("redacts every stored payload", async () => {
    await prisma.webhookEvent.create({
      data: {
        shopifyEventId: "evt-shop-1",
        topic: "orders/create",
        shopifyObjectId: "gid://shopify/Order/1",
        status: "completed",
        rawPayload: { id: 1, customer: { email: "a@example.com" } } as never,
      },
    });
    await prisma.webhookEvent.create({
      data: {
        shopifyEventId: "evt-shop-2",
        topic: "refunds/create",
        shopifyObjectId: "gid://shopify/Order/2",
        status: "completed",
        rawPayload: { id: 2 } as never,
      },
    });

    const { redacted } = await redactShopWebhookPayloads("kulture-konsign-dev.myshopify.com");
    expect(redacted).toBe(2);

    const remaining = await prisma.webhookEvent.count({ where: { rawPayload: { not: null } } });
    expect(remaining).toBe(0);
    // Rows survive — dedup and audit are unaffected.
    expect(await prisma.webhookEvent.count()).toBe(2);
  });
});
