// Accountant-style reconciliation of the local ledger against Shopify, for a
// date range.
//
// Consignors are credited on their listing price and the store absorbs any
// discount (see CLAUDE.md), so the ledger reconciles against Shopify's
// GROSS-of-discount line amounts. Shopify's net is reported alongside so the
// absorbed discount is visible rather than hidden in a tolerance.
//
// Flags, not fails. A discount is a store decision, so it prints and the run
// continues. A ledger disagreement is a defect and exits non-zero.
//
//   npx tsx scripts/sim/10-reconcile-shopify.ts                       # last 7 days
//   npx tsx scripts/sim/10-reconcile-shopify.ts --from=2026-10-01 --to=2026-10-31
//   npx tsx scripts/sim/10-reconcile-shopify.ts --source=api          # force Admin API
//   npx tsx scripts/sim/10-reconcile-shopify.ts --strict-loss         # loss also exits 1
//   npx tsx scripts/sim/10-reconcile-shopify.ts --json                # machine-readable
//
// Exit codes: 0 clean · 1 ledger disagreement (or loss with --strict-loss)
//             2 no usable data source (expired Shopify token, no stored payloads)

import { prisma, check, printSummary, header } from "./_shared.js";
import {
  reconcile,
  refundTotalFromWebhookPayload,
  shopifyOrderFromWebhookPayload,
  type LocalOrderSnapshot,
  type LocalTransactionLine,
  type ReconcileFinding,
  type ShopifyOrderSnapshot,
} from "~/services/orders/reconcile.server.js";

const SHOPIFY_API_VERSION = "2024-10";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

const STRICT_LOSS = process.argv.includes("--strict-loss");
const AS_JSON = process.argv.includes("--json");
const SOURCE = (arg("source") ?? "auto") as "auto" | "payloads" | "api";

function parseRange(): { from: Date; to: Date } {
  const toRaw = arg("to");
  const fromRaw = arg("from");
  const to = toRaw ? new Date(`${toRaw}T23:59:59.999Z`) : new Date();
  const from = fromRaw
    ? new Date(`${fromRaw}T00:00:00.000Z`)
    : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("Invalid --from/--to; expected YYYY-MM-DD");
  }
  if (from > to) throw new Error("--from is after --to");
  return { from, to };
}

function money(value: unknown): number {
  const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : 0;
}

function variantGid(variantId: unknown): string | null {
  if (variantId === null || variantId === undefined || variantId === "") return null;
  const raw = String(variantId);
  return raw.startsWith("gid://") ? raw : `gid://shopify/ProductVariant/${raw}`;
}

// ── Shopify side, source 1: stored webhook payloads ──────────────────────────

/**
 * Build snapshots from WebhookEvent.rawPayload. Preferred over the Admin API:
 * it is exactly what Shopify sent at the time, needs no token, and survives the
 * order being archived.
 */
async function fromStoredPayloads(from: Date, to: Date): Promise<ShopifyOrderSnapshot[] | null> {
  const events = await prisma.webhookEvent.findMany({
    where: {
      topic: { in: ["orders/create", "refunds/create"] },
      createdAt: { gte: from, lte: to },
      rawPayload: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: { topic: true, shopifyObjectId: true, rawPayload: true },
  });

  if (events.length === 0) return null;

  const byOrder = new Map<string, ShopifyOrderSnapshot>();

  for (const e of events) {
    const payload = e.rawPayload as Record<string, unknown>;
    if (e.topic === "orders/create") {
      const snapshot = shopifyOrderFromWebhookPayload(e.shopifyObjectId, payload);
      // A refund for this order may already have been folded in above.
      snapshot.refundedItemTotal = byOrder.get(e.shopifyObjectId)?.refundedItemTotal ?? 0;
      byOrder.set(e.shopifyObjectId, snapshot);
    } else {
      const refunded = refundTotalFromWebhookPayload(payload);
      const existing = byOrder.get(e.shopifyObjectId);
      if (existing) {
        existing.refundedItemTotal += refunded;
      } else {
        byOrder.set(e.shopifyObjectId, {
          shopifyOrderId: e.shopifyObjectId,
          orderName: null,
          lines: [],
          refundedItemTotal: refunded,
        });
      }
    }
  }

  return [...byOrder.values()];
}

// ── Shopify side, source 2: Admin API ────────────────────────────────────────

async function loadShopifyToken(): Promise<{ shop: string; token: string } | null> {
  const session = await prisma.session.findFirst({
    where: { accessToken: { not: "" } },
    orderBy: { expires: "desc" },
  });
  if (!session) return null;
  return { shop: session.shop, token: session.accessToken };
}

async function fromAdminApi(from: Date, to: Date): Promise<ShopifyOrderSnapshot[] | null> {
  const creds = await loadShopifyToken();
  if (!creds) {
    console.error("  No Shopify session row with an access token — cannot use the Admin API.");
    return null;
  }

  const query = `#graphql
    query Orders($query: String!, $cursor: String) {
      orders(first: 50, query: $query, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          name
          lineItems(first: 100) {
            nodes {
              quantity
              variant { id }
              originalUnitPriceSet { shopMoney { amount } }
              discountedTotalSet { shopMoney { amount } }
              originalTotalSet { shopMoney { amount } }
            }
          }
          refunds(first: 50) {
            totalRefundedSet { shopMoney { amount } }
            refundLineItems(first: 100) {
              nodes { subtotalSet { shopMoney { amount } } }
            }
          }
        }
      }
    }`;

  const snapshots: ShopifyOrderSnapshot[] = [];
  let cursor: string | null = null;
  const searchQuery = `created_at:>=${from.toISOString()} created_at:<=${to.toISOString()}`;

  do {
    const res = await fetch(
      `https://${creds.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": creds.token },
        body: JSON.stringify({ query, variables: { query: searchQuery, cursor } }),
      },
    );

    if (res.status === 401) {
      console.error("  Shopify returned HTTP 401 — the offline token expired.");
      console.error("  Open the Konsign app in your Shopify admin to refresh, then re-run.");
      return null;
    }
    if (!res.ok) throw new Error(`Shopify HTTP ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as Record<string, any>;
    if (body.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(body.errors)}`);

    for (const order of body.data.orders.nodes) {
      snapshots.push({
        shopifyOrderId: order.id,
        orderName: order.name ?? null,
        lines: order.lineItems.nodes.map((li: Record<string, any>) => {
          const originalTotal = money(li.originalTotalSet?.shopMoney?.amount);
          const discountedTotal = money(li.discountedTotalSet?.shopMoney?.amount);
          return {
            shopifyVariantId: li.variant?.id ?? null,
            quantity: Number(li.quantity) || 0,
            price: money(li.originalUnitPriceSet?.shopMoney?.amount),
            discount: Math.max(0, originalTotal - discountedTotal),
          };
        }),
        refundedItemTotal: (order.refunds ?? []).reduce(
          (s: number, r: Record<string, any>) =>
            s +
            (r.refundLineItems?.nodes ?? []).reduce(
              (t: number, rli: Record<string, any>) => t + money(rli.subtotalSet?.shopMoney?.amount),
              0,
            ),
          0,
        ),
      });
    }

    cursor = body.data.orders.pageInfo.hasNextPage ? body.data.orders.pageInfo.endCursor : null;
  } while (cursor);

  return snapshots;
}

// ── Local side ───────────────────────────────────────────────────────────────

async function loadLocalOrders(from: Date, to: Date): Promise<LocalOrderSnapshot[]> {
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: from, lte: to }, shopifyId: { not: null } },
    include: {
      items: {
        include: {
          listing: { include: { variant: { select: { shopifyVariantId: true } } } },
          transactions: true,
        },
      },
    },
  });

  return orders.map((order) => {
    const saleLines: LocalTransactionLine[] = [];
    const refundLines: LocalTransactionLine[] = [];
    const duplicateSaleOrderItemIds: string[] = [];

    for (const item of order.items) {
      const shopifyVariantId = item.listing.variant.shopifyVariantId ?? null;
      const sales = item.transactions.filter((t) => t.type === "sale");
      if (sales.length > 1) duplicateSaleOrderItemIds.push(item.id);

      for (const t of item.transactions) {
        const line: LocalTransactionLine = {
          transactionId: t.id,
          shopifyVariantId,
          // Ledger side converted here. The reconciler compares against
          // Shopify payload amounts, which arrive as JSON strings parsed to
          // numbers, so the comparison is number-based with an explicit
          // tolerance. Documented as a known leak in the migration notes.
          gross: t.grossAmount.toNumber(),
          fee: t.feeAmount.toNumber(),
          consignor: t.consignorAmount.toNumber(),
        };
        if (t.type === "sale") saleLines.push(line);
        else refundLines.push(line);
      }
    }

    return {
      shopifyOrderId: order.shopifyId!,
      orderName: order.orderNumber,
      saleLines,
      refundLines,
      duplicateSaleOrderItemIds,
    };
  });
}

// ── Reporting ────────────────────────────────────────────────────────────────

const TIER_LABEL: Record<ReconcileFinding["severity"], string> = {
  info: "[INFO]",
  warn: "[WARN]",
  fail: "[FAIL]",
};

function printFindings(findings: ReconcileFinding[]) {
  if (findings.length === 0) {
    console.log("\nNo discrepancies.");
    return;
  }
  // Worst first so a long report still leads with what matters.
  const order: Record<ReconcileFinding["severity"], number> = { fail: 0, warn: 1, info: 2 };
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);

  console.log("\nPer-order discrepancies");
  console.log("-".repeat(60));
  for (const f of sorted) {
    const name = f.orderName ?? f.shopifyOrderId ?? "(unknown order)";
    console.log(`${TIER_LABEL[f.severity]} ${name} · ${f.reason}`);
    console.log(`         ${f.message}`);
  }
}

async function main() {
  const { from, to } = parseRange();
  header(`Shopify reconciliation · ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`);

  let shopifyOrders: ShopifyOrderSnapshot[] | null = null;
  let sourceUsed = "";

  if (SOURCE === "payloads" || SOURCE === "auto") {
    shopifyOrders = await fromStoredPayloads(from, to);
    if (shopifyOrders) sourceUsed = `stored webhook payloads (${shopifyOrders.length} orders)`;
    else if (SOURCE === "payloads") {
      console.error("  No stored webhook payloads in range. Orders processed before");
      console.error("  migration 4 have none; re-run with --source=api.");
      process.exitCode = 2;
      return;
    }
  }

  if (!shopifyOrders) {
    console.log("  No stored payloads in range — falling back to the Admin API.");
    shopifyOrders = await fromAdminApi(from, to);
    if (!shopifyOrders) {
      process.exitCode = 2;
      return;
    }
    sourceUsed = `Shopify Admin API (${shopifyOrders.length} orders)`;
  }

  console.log(`  Source: ${sourceUsed}`);

  const localOrders = await loadLocalOrders(from, to);
  console.log(`  Local:  ${localOrders.length} orders with a Shopify id`);

  const report = reconcile(shopifyOrders, localOrders);

  if (AS_JSON) {
    console.log(JSON.stringify({ from, to, sourceUsed, ...report }, null, 2));
  } else {
    const t = report.totals;
    console.log("\nTotals (tax and shipping excluded throughout)");
    console.log("-".repeat(60));
    console.log(`  Shopify consignment lines, before discount  $${t.shopifyItemGrossSales.toFixed(2)}`);
    console.log(`  Discount absorbed by the store             -$${t.shopifyDiscounts.toFixed(2)}`);
    console.log(`  Shopify net collected on those lines        $${t.shopifyItemNetSales.toFixed(2)}`);
    console.log(`  Shopify refunds (line items only)          -$${t.shopifyRefunds.toFixed(2)}`);
    console.log("");
    console.log(`  Ledger sale gross                           $${t.localSaleGross.toFixed(2)}`);
    console.log(`  Ledger refund gross                        -$${t.localRefundGross.toFixed(2)}`);
    console.log(`  Ledger fee (store)                          $${t.localFee.toFixed(2)}`);
    console.log(`  Ledger consignor                            $${t.localConsignor.toFixed(2)}`);

    printFindings(report.findings);
  }

  const failCount = report.findings.filter((f) => f.severity === "fail").length;

  check({
    name: "Every transaction splits exactly: fee + consignorAmount == grossAmount",
    expected: "0 split mismatches",
    actual: `${report.findings.filter((f) => f.reason === "split_mismatch").length} mismatches`,
    ok: !report.findings.some((f) => f.reason === "split_mismatch"),
  });

  check({
    name: "Period: ledger net == Shopify consignment lines before discount, net of refunds",
    expected: "$0.00 delta",
    actual: `$${report.periodDelta.toFixed(2)} delta`,
    ok: Math.abs(report.periodDelta) <= 0.02,
    details:
      Math.abs(report.periodDelta) > 0.02
        ? "A non-zero delta here is a bookkeeping defect, not a discount — discounts are\nalready excluded by comparing against pre-discount line amounts."
        : undefined,
  });

  check({
    name: "No per-order discrepancies",
    expected: "0 fail-tier findings",
    actual: `${failCount} fail-tier findings`,
    ok: failCount === 0,
  });

  if (report.lossMakingItems > 0) {
    console.log(
      `\n[WARN] ${report.lossMakingItems} item(s) discounted past the store fee — realized loss $${report.realizedLoss.toFixed(2)}.`,
    );
    console.log("       Not a math error; the store absorbed more than it earned on those items.");
    if (STRICT_LOSS) {
      console.log("       --strict-loss is set, so this fails the run.");
      process.exitCode = 1;
    }
  }

  printSummary();
}

main()
  .catch((err) => {
    console.error("\nFATAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
