import { describe, it, expect } from "vitest";
import {
  reconcile,
  refundTotalFromWebhookPayload,
  shopifyOrderFromWebhookPayload,
} from "~/services/orders";
import type { LocalOrderSnapshot, ShopifyOrderSnapshot } from "~/services/orders";

const VARIANT_A = "gid://shopify/ProductVariant/1001";
const VARIANT_B = "gid://shopify/ProductVariant/1002";
const GIFT_CARD = "gid://shopify/ProductVariant/9999";

function shopifyOrder(over: Partial<ShopifyOrderSnapshot> = {}): ShopifyOrderSnapshot {
  return {
    shopifyOrderId: "gid://shopify/Order/1",
    orderName: "#KK1001",
    lines: [{ shopifyVariantId: VARIANT_A, quantity: 1, price: 200, discount: 0 }],
    refundedItemTotal: 0,
    ...over,
  };
}

/** A consignor at a 15% fee: $200 gross -> $30 fee, $170 consignor. */
function localOrder(over: Partial<LocalOrderSnapshot> = {}): LocalOrderSnapshot {
  return {
    shopifyOrderId: "gid://shopify/Order/1",
    orderName: "#KK1001",
    saleLines: [
      { transactionId: "tx1", shopifyVariantId: VARIANT_A, gross: 200, fee: 30, consignor: 170 },
    ],
    refundLines: [],
    duplicateSaleOrderItemIds: [],
    ...over,
  };
}

function reasons(report: ReturnType<typeof reconcile>) {
  return report.findings.map((f) => f.reason);
}

describe("reconcile — balanced period", () => {
  it("reports no findings when the ledger matches Shopify", () => {
    const report = reconcile([shopifyOrder()], [localOrder()]);

    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.periodDelta).toBe(0);
    expect(report.totals.shopifyItemGrossSales).toBe(200);
    expect(report.totals.localSaleGross).toBe(200);
    expect(report.totals.localFee).toBe(30);
    expect(report.totals.localConsignor).toBe(170);
  });

  it("excludes tax and shipping by construction — only line items are compared", () => {
    // Nothing in the snapshot carries tax or shipping; a Shopify order whose
    // grand total is far higher still reconciles on its line items alone.
    const report = reconcile([shopifyOrder()], [localOrder()]);
    expect(report.periodDelta).toBe(0);
  });

  it("ignores non-consignment lines like gift cards", () => {
    const report = reconcile(
      [
        shopifyOrder({
          lines: [
            { shopifyVariantId: VARIANT_A, quantity: 1, price: 200, discount: 0 },
            { shopifyVariantId: GIFT_CARD, quantity: 2, price: 25, discount: 0 },
          ],
        }),
      ],
      [localOrder()],
    );

    expect(report.ok).toBe(true);
    expect(report.totals.shopifyItemGrossSales).toBe(200); // gift card excluded
  });

  it("reconciles a multi-quantity line against per-item listings", () => {
    const report = reconcile(
      [shopifyOrder({ lines: [{ shopifyVariantId: VARIANT_A, quantity: 2, price: 200, discount: 0 }] })],
      [
        localOrder({
          saleLines: [
            { transactionId: "tx1", shopifyVariantId: VARIANT_A, gross: 200, fee: 30, consignor: 170 },
            { transactionId: "tx2", shopifyVariantId: VARIANT_A, gross: 200, fee: 30, consignor: 170 },
          ],
        }),
      ],
    );

    expect(report.ok).toBe(true);
    expect(report.totals.shopifyItemGrossSales).toBe(400);
    expect(report.totals.localSaleGross).toBe(400);
  });
});

describe("reconcile — discounts are flagged, never failed", () => {
  it("flags a discount on a consignment item as info and still balances", () => {
    // Store absorbs it: consignor is credited on the $200 listing price even
    // though Shopify only collected $180.
    const report = reconcile(
      [shopifyOrder({ lines: [{ shopifyVariantId: VARIANT_A, quantity: 1, price: 200, discount: 20 }] })],
      [localOrder()],
    );

    expect(reasons(report)).toEqual(["discount_on_consignment_item"]);
    expect(report.findings[0].severity).toBe("info");
    expect(report.ok).toBe(true); // a discount is not a defect
    expect(report.periodDelta).toBe(0); // because we compare pre-discount
    expect(report.totals.shopifyItemGrossSales).toBe(200);
    expect(report.totals.shopifyItemNetSales).toBe(180);
    expect(report.totals.shopifyDiscounts).toBe(20);
    expect(report.lossMakingItems).toBe(0);
  });

  it("warns when the discount exceeds the store fee, with the realized loss", () => {
    // $50 off a $200 item whose fee is only $30: the store paid out $20 more
    // than it collected.
    const report = reconcile(
      [shopifyOrder({ lines: [{ shopifyVariantId: VARIANT_A, quantity: 1, price: 200, discount: 50 }] })],
      [localOrder()],
    );

    expect(reasons(report)).toEqual(["discount_on_consignment_item", "discount_exceeds_fee"]);
    const loss = report.findings.find((f) => f.reason === "discount_exceeds_fee")!;
    expect(loss.severity).toBe("warn");
    expect(loss.delta).toBe(20);
    expect(report.lossMakingItems).toBe(1);
    expect(report.realizedLoss).toBe(20);
    expect(report.ok).toBe(true); // flags, not fails
  });

  it("does not warn when the discount is exactly the fee", () => {
    const report = reconcile(
      [shopifyOrder({ lines: [{ shopifyVariantId: VARIANT_A, quantity: 1, price: 200, discount: 30 }] })],
      [localOrder()],
    );

    expect(reasons(report)).toEqual(["discount_on_consignment_item"]);
    expect(report.lossMakingItems).toBe(0);
  });
});

describe("reconcile — known mismatches", () => {
  it("flags a Shopify order with no local row as missing_locally", () => {
    const report = reconcile([shopifyOrder()], []);

    expect(reasons(report)).toContain("missing_locally");
    expect(report.findings[0].severity).toBe("fail");
    expect(report.ok).toBe(false);
  });

  it("flags a local order with no Shopify counterpart as local_only", () => {
    const report = reconcile([], [localOrder()]);

    expect(reasons(report)).toContain("local_only");
    expect(report.ok).toBe(false);
  });

  it("flags an amount mismatch with the delta", () => {
    // Shopify sold it at $250; the ledger credited $200.
    const report = reconcile(
      [shopifyOrder({ lines: [{ shopifyVariantId: VARIANT_A, quantity: 1, price: 250, discount: 0 }] })],
      [localOrder()],
    );

    const mismatch = report.findings.find((f) => f.reason === "amount_mismatch")!;
    expect(mismatch.severity).toBe("fail");
    expect(mismatch.localAmount).toBe(200);
    expect(mismatch.shopifyAmount).toBe(250);
    expect(mismatch.delta).toBe(-50);
    expect(report.periodDelta).toBe(-50);
    expect(report.ok).toBe(false);
  });

  it("flags a refund mismatch", () => {
    // Shopify refunded the item; the ledger has no refund transaction.
    const report = reconcile([shopifyOrder({ refundedItemTotal: 200 })], [localOrder()]);

    const mismatch = report.findings.find((f) => f.reason === "refund_mismatch")!;
    expect(mismatch.severity).toBe("fail");
    expect(mismatch.localAmount).toBe(0);
    expect(mismatch.shopifyAmount).toBe(200);
    expect(report.ok).toBe(false);
  });

  it("flags duplicate sale transactions on one order item", () => {
    const report = reconcile(
      [shopifyOrder()],
      [
        localOrder({
          saleLines: [
            { transactionId: "tx1", shopifyVariantId: VARIANT_A, gross: 200, fee: 30, consignor: 170 },
            { transactionId: "tx2", shopifyVariantId: VARIANT_A, gross: 200, fee: 30, consignor: 170 },
          ],
          duplicateSaleOrderItemIds: ["item-1"],
        }),
      ],
    );

    expect(reasons(report)).toContain("duplicate");
    // Double credit also shows up as an amount mismatch — $400 booked, $200 sold.
    expect(reasons(report)).toContain("amount_mismatch");
    expect(report.ok).toBe(false);
  });

  it("flags a transaction whose fee + consignorAmount != grossAmount", () => {
    const report = reconcile(
      [shopifyOrder()],
      [
        localOrder({
          saleLines: [
            { transactionId: "tx-bad", shopifyVariantId: VARIANT_A, gross: 200, fee: 30, consignor: 150 },
          ],
        }),
      ],
    );

    const split = report.findings.find((f) => f.reason === "split_mismatch")!;
    expect(split.severity).toBe("fail");
    expect(split.delta).toBe(-20);
    expect(report.ok).toBe(false);
  });

  it("reports several independent mismatches in one period, worst-first by severity", () => {
    const report = reconcile(
      [
        shopifyOrder({ shopifyOrderId: "gid://shopify/Order/1", orderName: "#KK1001" }),
        shopifyOrder({
          shopifyOrderId: "gid://shopify/Order/2",
          orderName: "#KK1002",
          lines: [{ shopifyVariantId: VARIANT_B, quantity: 1, price: 100, discount: 40 }],
        }),
        shopifyOrder({ shopifyOrderId: "gid://shopify/Order/3", orderName: "#KK1003" }),
      ],
      [
        localOrder(),
        localOrder({
          shopifyOrderId: "gid://shopify/Order/2",
          orderName: "#KK1002",
          saleLines: [
            { transactionId: "tx2", shopifyVariantId: VARIANT_B, gross: 100, fee: 15, consignor: 85 },
          ],
        }),
        localOrder({ shopifyOrderId: "gid://shopify/Order/99", orderName: "#KK1099" }),
      ],
    );

    const found = reasons(report);
    expect(found).toContain("missing_locally"); // order 3
    expect(found).toContain("local_only"); // order 99
    expect(found).toContain("discount_on_consignment_item"); // order 2
    expect(found).toContain("discount_exceeds_fee"); // $40 off vs $15 fee
    expect(report.realizedLoss).toBe(25);
    expect(report.ok).toBe(false);
    expect(report.ordersCompared).toBe(4);
  });
});

describe("reconcile — tolerance", () => {
  it("absorbs sub-cent Float drift", () => {
    const report = reconcile(
      [shopifyOrder()],
      [
        localOrder({
          saleLines: [
            { transactionId: "tx1", shopifyVariantId: VARIANT_A, gross: 200.001, fee: 30, consignor: 170.001 },
          ],
        }),
      ],
    );

    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
  });

  it("respects an explicit tolerance", () => {
    const shopify = [shopifyOrder()];
    const local = [
      localOrder({
        saleLines: [
          { transactionId: "tx1", shopifyVariantId: VARIANT_A, gross: 200.01, fee: 30, consignor: 170.01 },
        ],
      }),
    ];

    expect(reconcile(shopify, local).ok).toBe(true);
    expect(reconcile(shopify, local, { tolerance: 0.001 }).ok).toBe(false);
  });
});

describe("reconcile — webhook payload mapping", () => {
  it("reads line prices pre-discount and sums every discount allocation", () => {
    // Shopify emits one allocation per participating discount, and an order can
    // carry several on the same line.
    const snapshot = shopifyOrderFromWebhookPayload("gid://shopify/Order/5", {
      name: "#KK1005",
      line_items: [
        {
          variant_id: 1001,
          quantity: 2,
          price: "200.00",
          discount_allocations: [{ amount: "15.00" }, { amount: "5.50" }],
        },
      ],
    });

    expect(snapshot.orderName).toBe("#KK1005");
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.lines[0]).toEqual({
      shopifyVariantId: "gid://shopify/ProductVariant/1001",
      quantity: 2,
      price: 200,
      discount: 20.5,
    });
  });

  it("ignores tax and shipping fields entirely", () => {
    const snapshot = shopifyOrderFromWebhookPayload("gid://shopify/Order/6", {
      name: "#KK1006",
      total_tax: "34.50",
      total_shipping_price_set: { shop_money: { amount: "15.00" } },
      total_price: "249.50",
      line_items: [{ variant_id: 1001, quantity: 1, price: "200.00" }],
    });

    // Only the line item survives; the $49.50 of tax + shipping is not represented.
    expect(snapshot.lines[0].price).toBe(200);
    expect(snapshot.lines[0].discount).toBe(0);
  });

  it("tolerates a missing variant, missing allocations, and unparseable money", () => {
    const snapshot = shopifyOrderFromWebhookPayload("gid://shopify/Order/7", {
      line_items: [
        { variant_id: null, quantity: 1, price: "25.00" },
        { variant_id: 1002, quantity: 1, price: null },
      ],
    });

    expect(snapshot.orderName).toBeNull();
    expect(snapshot.lines[0].shopifyVariantId).toBeNull();
    expect(snapshot.lines[1].price).toBe(0);
    expect(snapshot.lines[1].discount).toBe(0);
  });

  it("accepts a variant id that is already a gid", () => {
    const snapshot = shopifyOrderFromWebhookPayload("gid://shopify/Order/8", {
      line_items: [{ variant_id: "gid://shopify/ProductVariant/1003", quantity: 1, price: "10" }],
    });
    expect(snapshot.lines[0].shopifyVariantId).toBe("gid://shopify/ProductVariant/1003");
  });

  it("handles a payload with no line_items at all", () => {
    expect(shopifyOrderFromWebhookPayload("gid://shopify/Order/9", {}).lines).toEqual([]);
  });

  it("sums refund line subtotals, which exclude tax", () => {
    // total_refunded would be 230 (incl. tax); the comparison must use 200.
    const total = refundTotalFromWebhookPayload({
      total_refunded: "230.00",
      refund_line_items: [{ subtotal: "150.00" }, { subtotal: "50.00" }],
    });
    expect(total).toBe(200);
  });

  it("returns zero for a refund payload with no line items", () => {
    expect(refundTotalFromWebhookPayload({})).toBe(0);
    expect(refundTotalFromWebhookPayload({ refund_line_items: [] })).toBe(0);
  });

  it("maps a payload and a ledger row to a balanced reconciliation end to end", () => {
    const shopify = shopifyOrderFromWebhookPayload("gid://shopify/Order/1", {
      name: "#KK1001",
      total_tax: "30.00",
      line_items: [{ variant_id: 1001, quantity: 1, price: "200.00", discount_allocations: [] }],
    });

    const report = reconcile([shopify], [localOrder()]);
    expect(report.ok).toBe(true);
    expect(report.periodDelta).toBe(0);
  });
});
