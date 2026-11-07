/**
 * Accountant-style reconciliation of the local ledger against Shopify.
 *
 * Pure comparison — no database, no network, no business logic. The caller
 * supplies both sides as snapshots; `scripts/sim/10-reconcile-shopify.ts` does
 * the fetching and printing. Keeping it pure is what makes a known mismatch
 * testable.
 *
 * ## The equality being asserted
 *
 * Consignors set their price and are credited on **their listing price**; the
 * store takes only its fee percentage, so an order discount comes entirely out
 * of the store's side (see CLAUDE.md). A Transaction's `grossAmount` is
 * therefore the listing price, which is the price we pushed to Shopify — the
 * line's price *before* any discount.
 *
 * So the ledger reconciles against Shopify's **gross-of-discount** line amounts:
 *
 *     Σ localSaleGross − Σ localRefundGross
 *       == Σ (line.price × qty) over consignment lines − Σ shopifyRefunds
 *
 * Shopify's *net* (after discount) is what the store actually collected. The gap
 * between gross and net is the discount the store absorbed, reported separately
 * so it is visible rather than silently folded into a tolerance.
 *
 * ## Severity
 *
 * A discount is a store decision, not a defect in the math, so it never fails
 * the run. A ledger disagreement is a defect and always does.
 *
 *   info — discount landed on a consignment item (consignment variants are
 *          meant to be excluded from discounts in Shopify, so this says the
 *          Shopify config drifted)
 *   warn — that discount exceeded the fee on the item, so the store paid out
 *          more than it collected: realized loss
 *   fail — missing locally, local only, duplicate, amount mismatch, refund
 *          mismatch, or a transaction whose fee + consignor != gross
 */

export type ReconcileSeverity = "info" | "warn" | "fail";

export type ReconcileReason =
  | "missing_locally"
  | "local_only"
  | "duplicate"
  | "amount_mismatch"
  | "refund_mismatch"
  | "split_mismatch"
  | "discount_on_consignment_item"
  | "discount_exceeds_fee";

export type ReconcileFinding = {
  severity: ReconcileSeverity;
  reason: ReconcileReason;
  shopifyOrderId: string | null;
  orderName: string | null;
  message: string;
  shopifyAmount?: number;
  localAmount?: number;
  delta?: number;
};

/** One Shopify line item as Shopify reports it. */
export type ShopifyLine = {
  /** null when Shopify sent no variant (custom line, deleted variant) */
  shopifyVariantId: string | null;
  quantity: number;
  /** unit price BEFORE any discount */
  price: number;
  /** total discount allocated to this line (positive) */
  discount: number;
};

export type ShopifyOrderSnapshot = {
  shopifyOrderId: string;
  orderName: string | null;
  lines: ShopifyLine[];
  /** refunded line-item subtotal, excluding tax and shipping (positive) */
  refundedItemTotal: number;
};

export type LocalTransactionLine = {
  transactionId: string;
  /** the Shopify variant this transaction's listing points at */
  shopifyVariantId: string | null;
  /** grossAmount as stored; negative for refunds */
  gross: number;
  fee: number;
  consignor: number;
};

export type LocalOrderSnapshot = {
  shopifyOrderId: string;
  orderName: string | null;
  saleLines: LocalTransactionLine[];
  refundLines: LocalTransactionLine[];
  /** OrderItem ids carrying more than one sale transaction */
  duplicateSaleOrderItemIds: string[];
};

export type ReconcileTotals = {
  /** Σ (line.price × qty) over consignment lines — what the ledger must match */
  shopifyItemGrossSales: number;
  /** gross minus discounts — what the store actually collected on those lines */
  shopifyItemNetSales: number;
  /** discount absorbed by the store on consignment lines */
  shopifyDiscounts: number;
  shopifyRefunds: number;
  localSaleGross: number;
  /** absolute value of refund gross */
  localRefundGross: number;
  localFee: number;
  localConsignor: number;
};

export type ReconcileReport = {
  ordersCompared: number;
  totals: ReconcileTotals;
  findings: ReconcileFinding[];
  /** (localSale − localRefund) − (shopifyGross − shopifyRefunds); 0 when balanced */
  periodDelta: number;
  /** true when nothing fail-tier was found */
  ok: boolean;
  lossMakingItems: number;
  realizedLoss: number;
};

const DEFAULT_TOLERANCE = 0.02;

/** Shopify sends money as strings; anything unparseable means "not charged". */
function money(value: unknown): number {
  const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : 0;
}

function variantGid(variantId: unknown): string | null {
  if (variantId === null || variantId === undefined || variantId === "") return null;
  const raw = String(variantId);
  return raw.startsWith("gid://") ? raw : `gid://shopify/ProductVariant/${raw}`;
}

/**
 * Map a stored `orders/create` webhook payload to a snapshot.
 *
 * `line_items[].price` is the unit price BEFORE discount, and the discount lives
 * in `discount_allocations[]` — summed, because Shopify emits one allocation per
 * participating discount and an order can carry several.
 *
 * Tax and shipping are never read: this returns line items only.
 */
export function shopifyOrderFromWebhookPayload(
  shopifyOrderId: string,
  payload: Record<string, unknown>,
): ShopifyOrderSnapshot {
  const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];
  return {
    shopifyOrderId,
    orderName: typeof payload.name === "string" ? payload.name : null,
    lines: lineItems.map((raw): ShopifyLine => {
      const li = raw as Record<string, unknown>;
      const allocations = Array.isArray(li.discount_allocations) ? li.discount_allocations : [];
      return {
        shopifyVariantId: variantGid(li.variant_id),
        quantity: Number(li.quantity) || 0,
        price: money(li.price),
        discount: allocations.reduce(
          (s: number, d) => s + money((d as Record<string, unknown>).amount),
          0,
        ),
      };
    }),
    refundedItemTotal: 0,
  };
}

/**
 * Line-item subtotal from a stored `refunds/create` payload.
 *
 * `refund_line_items[].subtotal` already excludes tax, which is what the
 * comparison needs — `refund.total_refunded` would include tax and shipping.
 */
export function refundTotalFromWebhookPayload(payload: Record<string, unknown>): number {
  const items = Array.isArray(payload.refund_line_items) ? payload.refund_line_items : [];
  return items.reduce((s: number, raw) => s + money((raw as Record<string, unknown>).subtotal), 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Consignment lines are the ones that mapped to a local listing. */
function consignmentVariantIds(local: LocalOrderSnapshot | undefined): Set<string> {
  const ids = new Set<string>();
  if (!local) return ids;
  for (const line of [...local.saleLines, ...local.refundLines]) {
    if (line.shopifyVariantId) ids.add(line.shopifyVariantId);
  }
  return ids;
}

export function reconcile(
  shopifyOrders: ShopifyOrderSnapshot[],
  localOrders: LocalOrderSnapshot[],
  opts: { tolerance?: number } = {},
): ReconcileReport {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const findings: ReconcileFinding[] = [];

  const localById = new Map(localOrders.map((o) => [o.shopifyOrderId, o]));
  const shopifyById = new Map(shopifyOrders.map((o) => [o.shopifyOrderId, o]));

  const totals: ReconcileTotals = {
    shopifyItemGrossSales: 0,
    shopifyItemNetSales: 0,
    shopifyDiscounts: 0,
    shopifyRefunds: 0,
    localSaleGross: 0,
    localRefundGross: 0,
    localFee: 0,
    localConsignor: 0,
  };

  let lossMakingItems = 0;
  let realizedLoss = 0;

  for (const shopifyOrder of shopifyOrders) {
    const local = localById.get(shopifyOrder.shopifyOrderId);
    const consignmentIds = consignmentVariantIds(local);

    // (a) Shopify side: per-line, excluding tax and shipping entirely.
    let orderGross = 0;
    let orderNet = 0;
    let orderDiscount = 0;

    for (const line of shopifyOrder.lines) {
      // Only consignment lines belong in the comparison. A gift card or a
      // product created outside this app is correctly absent from the ledger.
      if (!line.shopifyVariantId || !consignmentIds.has(line.shopifyVariantId)) continue;

      const lineGross = line.price * line.quantity;
      orderGross += lineGross;
      orderNet += lineGross - line.discount;
      orderDiscount += line.discount;

      if (line.discount > tolerance) {
        findings.push({
          severity: "info",
          reason: "discount_on_consignment_item",
          shopifyOrderId: shopifyOrder.shopifyOrderId,
          orderName: shopifyOrder.orderName,
          message: `$${round2(line.discount).toFixed(2)} discount on consignment item ${line.shopifyVariantId} — consignment variants should be excluded from discounts in Shopify`,
          shopifyAmount: round2(line.discount),
        });

        // The store's fee on this line is the only thing absorbing the discount.
        const feeOnLine = (local?.saleLines ?? [])
          .filter((l) => l.shopifyVariantId === line.shopifyVariantId)
          .reduce((s, l) => s + l.fee, 0);

        if (line.discount - feeOnLine > tolerance) {
          const loss = round2(line.discount - feeOnLine);
          lossMakingItems++;
          realizedLoss += loss;
          findings.push({
            severity: "warn",
            reason: "discount_exceeds_fee",
            shopifyOrderId: shopifyOrder.shopifyOrderId,
            orderName: shopifyOrder.orderName,
            message: `discount $${round2(line.discount).toFixed(2)} exceeds the store fee $${round2(feeOnLine).toFixed(2)} on ${line.shopifyVariantId} — store paid out $${loss.toFixed(2)} more than it collected`,
            shopifyAmount: round2(line.discount),
            localAmount: round2(feeOnLine),
            delta: loss,
          });
        }
      }
    }

    totals.shopifyItemGrossSales += orderGross;
    totals.shopifyItemNetSales += orderNet;
    totals.shopifyDiscounts += orderDiscount;
    totals.shopifyRefunds += shopifyOrder.refundedItemTotal;

    // (d) missing locally
    if (!local) {
      findings.push({
        severity: "fail",
        reason: "missing_locally",
        shopifyOrderId: shopifyOrder.shopifyOrderId,
        orderName: shopifyOrder.orderName,
        message: "Shopify order has no local Order row — the webhook never landed or was dropped",
        shopifyAmount: round2(shopifyOrder.lines.reduce((s, l) => s + l.price * l.quantity, 0)),
      });
      continue;
    }

    // (b) local side
    const localSale = local.saleLines.reduce((s, l) => s + l.gross, 0);
    const localRefund = Math.abs(local.refundLines.reduce((s, l) => s + l.gross, 0));

    if (local.duplicateSaleOrderItemIds.length > 0) {
      findings.push({
        severity: "fail",
        reason: "duplicate",
        shopifyOrderId: shopifyOrder.shopifyOrderId,
        orderName: shopifyOrder.orderName,
        message: `${local.duplicateSaleOrderItemIds.length} order item(s) carry more than one sale transaction — double credit`,
      });
    }

    if (Math.abs(localSale - orderGross) > tolerance) {
      findings.push({
        severity: "fail",
        reason: "amount_mismatch",
        shopifyOrderId: shopifyOrder.shopifyOrderId,
        orderName: shopifyOrder.orderName,
        message: `ledger credits $${round2(localSale).toFixed(2)} but Shopify consignment lines total $${round2(orderGross).toFixed(2)} before discount`,
        localAmount: round2(localSale),
        shopifyAmount: round2(orderGross),
        delta: round2(localSale - orderGross),
      });
    }

    if (Math.abs(localRefund - shopifyOrder.refundedItemTotal) > tolerance) {
      findings.push({
        severity: "fail",
        reason: "refund_mismatch",
        shopifyOrderId: shopifyOrder.shopifyOrderId,
        orderName: shopifyOrder.orderName,
        message: `ledger refunds $${round2(localRefund).toFixed(2)} but Shopify refunded $${round2(shopifyOrder.refundedItemTotal).toFixed(2)} in line items`,
        localAmount: round2(localRefund),
        shopifyAmount: round2(shopifyOrder.refundedItemTotal),
        delta: round2(localRefund - shopifyOrder.refundedItemTotal),
      });
    }
  }

  // (c) per-transaction split, and local totals, over every local order.
  for (const local of localOrders) {
    for (const line of [...local.saleLines, ...local.refundLines]) {
      if (Math.abs(line.fee + line.consignor - line.gross) > tolerance) {
        findings.push({
          severity: "fail",
          reason: "split_mismatch",
          shopifyOrderId: local.shopifyOrderId,
          orderName: local.orderName,
          message: `transaction ${line.transactionId}: fee $${round2(line.fee).toFixed(2)} + consignor $${round2(line.consignor).toFixed(2)} != gross $${round2(line.gross).toFixed(2)}`,
          delta: round2(line.fee + line.consignor - line.gross),
        });
      }
    }

    totals.localSaleGross += local.saleLines.reduce((s, l) => s + l.gross, 0);
    totals.localRefundGross += Math.abs(local.refundLines.reduce((s, l) => s + l.gross, 0));
    totals.localFee += [...local.saleLines, ...local.refundLines].reduce((s, l) => s + l.fee, 0);
    totals.localConsignor += [...local.saleLines, ...local.refundLines].reduce((s, l) => s + l.consignor, 0);

    // (d) local only
    if (!shopifyById.has(local.shopifyOrderId)) {
      findings.push({
        severity: "fail",
        reason: "local_only",
        shopifyOrderId: local.shopifyOrderId,
        orderName: local.orderName,
        message: "local Order has no matching Shopify order in the period — stale, test, or hand-created data",
        localAmount: round2(local.saleLines.reduce((s, l) => s + l.gross, 0)),
      });
    }
  }

  for (const key of Object.keys(totals) as Array<keyof ReconcileTotals>) {
    totals[key] = round2(totals[key]);
  }

  const periodDelta = round2(
    totals.localSaleGross -
      totals.localRefundGross -
      (totals.shopifyItemGrossSales - totals.shopifyRefunds),
  );

  return {
    ordersCompared: new Set([...localById.keys(), ...shopifyById.keys()]).size,
    totals,
    findings,
    periodDelta,
    ok: !findings.some((f) => f.severity === "fail") && Math.abs(periodDelta) <= tolerance,
    lossMakingItems,
    realizedLoss: round2(realizedLoss),
  };
}
