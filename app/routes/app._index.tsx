import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { createListing, cancelListing, updateListingQuantity } from "~/services/listings.server";
import { processOrder, cancelOrder, refundOrder, getConsignorBalance } from "~/services/orders.server";
import prisma from "~/db.server";

const PRESETS = [
  {
    label: "Dunk Panda sz 9 — $340",
    styleId: "DD1391-100",
    title: "Nike Dunk Panda",
    brand: "Nike",
    size: "9",
    price: "340",
    quantity: "1",
    purpose: "Lowest ask — Shopify price should show $340",
  },
  {
    label: "Dunk Panda sz 9 — $360",
    styleId: "DD1391-100",
    title: "Nike Dunk Panda",
    brand: "Nike",
    size: "9",
    price: "360",
    quantity: "1",
    purpose: "Higher ask — tests multi-price, same variant",
  },
  {
    label: "Dunk Panda sz 10 — $350",
    styleId: "DD1391-100",
    title: "Nike Dunk Panda",
    brand: "Nike",
    size: "10",
    price: "350",
    quantity: "1",
    purpose: "Adds new size variant to existing product",
  },
  {
    label: "Jordan 1 Bred sz 9 — $450",
    styleId: "555088-001",
    title: "Jordan 1 Retro High OG Bred",
    brand: "Jordan",
    size: "9",
    price: "450",
    quantity: "1",
    purpose: "Creates a brand new product",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const consignors = await prisma.consignor.findMany({
    orderBy: { name: "asc" },
  });

  const listings = await prisma.listing.findMany({
    include: {
      consignor: true,
      variant: { include: { product: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const orders = await prisma.order.findMany({
    include: {
      items: {
        include: {
          listing: {
            include: {
              consignor: true,
              variant: { include: { product: true } },
            },
          },
          transactions: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get balances for all consignors
  const balances: Record<string, number> = {};
  for (const c of consignors) {
    balances[c.id] = await getConsignorBalance(c.id);
  }

  return { consignors, listings, orders, balances };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string ?? "create";

  try {
    if (intent === "cancel") {
      const listing = await cancelListing({
        admin,
        listingId: formData.get("listingId") as string,
      });
      return { listing, intent };
    }

    if (intent === "updateQuantity") {
      const listing = await updateListingQuantity({
        admin,
        listingId: formData.get("listingId") as string,
        quantity: parseInt(formData.get("quantity") as string, 10),
      });
      return { listing, intent };
    }

    if (intent === "simulateOrder") {
      const variantId = formData.get("variantId") as string;
      const quantity = parseInt(formData.get("quantity") as string, 10);

      const variant = await prisma.variant.findUniqueOrThrow({
        where: { id: variantId },
      });

      if (!variant.shopifyVariantId) {
        return { error: "Variant has no Shopify ID — create a listing first", intent };
      }

      const shopifyOrderId = `gid://shopify/Order/sim-${Date.now()}`;
      const order = await processOrder({
        admin,
        shopifyOrderId,
        lineItems: [{
          shopifyVariantId: variant.shopifyVariantId,
          quantity,
          price: 0,
        }],
      });

      return { order, intent };
    }

    if (intent === "cancelOrder") {
      const shopifyOrderId = formData.get("shopifyOrderId") as string;
      await cancelOrder({ admin, shopifyOrderId });
      return { success: true, intent };
    }

    if (intent === "refundOrder") {
      const shopifyOrderId = formData.get("shopifyOrderId") as string;
      await refundOrder({ admin, shopifyOrderId });
      return { success: true, intent };
    }

    if (intent === "partialRefund") {
      const shopifyOrderId = formData.get("shopifyOrderId") as string;
      const shopifyVariantId = formData.get("shopifyVariantId") as string;
      const quantity = parseInt(formData.get("quantity") as string, 10);
      await refundOrder({
        admin,
        shopifyOrderId,
        refundLineItems: [{ shopifyVariantId, quantity }],
      });
      return { success: true, intent };
    }

    const listing = await createListing({
      admin,
      styleId: formData.get("styleId") as string,
      title: formData.get("title") as string,
      brand: (formData.get("brand") as string) || undefined,
      size: formData.get("size") as string,
      price: parseFloat(formData.get("price") as string),
      quantity: parseInt(formData.get("quantity") as string, 10),
      consignorId: formData.get("consignorId") as string,
    });

    return { listing, intent };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message, intent };
  }
};

export default function Index() {
  const { consignors, listings, orders, balances } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [selectedConsignor, setSelectedConsignor] = useState(
    consignors[0]?.id ?? ""
  );

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    const data = fetcher.data as Record<string, unknown> | undefined;
    if (!data) return;

    if (data.error) {
      shopify.toast.show(data.error as string);
      return;
    }

    const messages: Record<string, string> = {
      create: "Listing created",
      cancel: "Listing cancelled",
      updateQuantity: "Quantity updated",
      simulateOrder: "Order simulated",
      cancelOrder: "Order cancelled (voided)",
      refundOrder: "Order refunded",
      partialRefund: "Partial refund applied",
    };
    const intent = data.intent as string;
    if (intent) {
      shopify.toast.show(messages[intent] ?? "Done");
    }
  }, [fetcher.data, shopify]);

  const submitPreset = (preset: (typeof PRESETS)[number]) => {
    const data: Record<string, string> = {
      intent: "create",
      styleId: preset.styleId,
      title: preset.title,
      brand: preset.brand,
      size: preset.size,
      price: preset.price,
      quantity: preset.quantity,
      consignorId: selectedConsignor,
    };
    fetcher.submit(data, { method: "POST" });
  };

  const submitCancel = (listingId: string) => {
    fetcher.submit({ intent: "cancel", listingId }, { method: "POST" });
  };

  const submitUpdateQty = (listingId: string, quantity: string) => {
    fetcher.submit({ intent: "updateQuantity", listingId, quantity }, { method: "POST" });
  };

  const submitSimulateOrder = (variantId: string, quantity: number) => {
    fetcher.submit(
      { intent: "simulateOrder", variantId, quantity: String(quantity) },
      { method: "POST" }
    );
  };

  const submitCancelOrder = (shopifyOrderId: string) => {
    fetcher.submit({ intent: "cancelOrder", shopifyOrderId }, { method: "POST" });
  };

  const submitRefundOrder = (shopifyOrderId: string) => {
    fetcher.submit({ intent: "refundOrder", shopifyOrderId }, { method: "POST" });
  };

  const submitPartialRefund = (shopifyOrderId: string, shopifyVariantId: string, quantity: number) => {
    fetcher.submit(
      { intent: "partialRefund", shopifyOrderId, shopifyVariantId, quantity: String(quantity) },
      { method: "POST" }
    );
  };

  // Get unique variants with active listings for the order simulator
  const activeVariants = listings
    .filter((l) => l.status === "active")
    .reduce(
      (acc, l) => {
        const key = l.variant.id;
        if (!acc.find((v) => v.id === key)) {
          acc.push({
            id: l.variant.id,
            label: `${l.variant.product.title} sz ${l.variant.size}`,
            totalQty: listings
              .filter((li) => li.variant.id === key && li.status === "active")
              .reduce((sum, li) => sum + li.quantity, 0),
          });
        }
        return acc;
      },
      [] as Array<{ id: string; label: string; totalQty: number }>
    );

  return (
    <s-page heading="Consignment App — Test Panel">
      {/* Consignor selector */}
      <s-section heading="Consignor">
        {consignors.length === 0 ? (
          <s-paragraph>
            No consignors found. Run: npx tsx prisma/seed.ts
          </s-paragraph>
        ) : (
          <select
            value={selectedConsignor}
            onChange={(e) => setSelectedConsignor(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "14px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
          >
            {consignors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({(c.commissionRate * 100).toFixed(0)}%) — Balance: $
                {(balances[c.id] ?? 0).toFixed(2)}
              </option>
            ))}
          </select>
        )}
      </s-section>

      {/* Test presets */}
      <s-section heading="Test Scenarios">
        <s-paragraph>
          Each button creates a listing with different parameters. Use them in
          order to test all code paths.
        </s-paragraph>

        <s-stack gap="base">
          {PRESETS.map((preset, i) => (
            <s-card key={i}>
              <s-stack direction="inline" gap="base" align="center">
                <s-button
                  onClick={() => submitPreset(preset)}
                  {...(isLoading ? { disabled: true } : {})}
                >
                  {preset.label}
                </s-button>
                <s-text variant="bodyMd" tone="subdued">
                  {preset.purpose}
                </s-text>
              </s-stack>
              <s-text variant="bodySm" tone="subdued">
                {preset.styleId} | ${preset.price} | qty {preset.quantity}
              </s-text>
            </s-card>
          ))}
        </s-stack>
      </s-section>

      {/* Order Simulator */}
      <s-section heading="Simulate Order">
        {activeVariants.length === 0 ? (
          <s-paragraph>No active listings to order from. Create listings first.</s-paragraph>
        ) : (
          <s-stack gap="base">
            <s-paragraph>
              Simulate a customer buying 1 unit of a variant. This allocates the cheapest listing, deducts inventory, and creates transactions.
            </s-paragraph>
            {activeVariants.map((v) => (
              <s-card key={v.id}>
                <s-stack direction="inline" gap="base" align="center">
                  <s-button
                    onClick={() => submitSimulateOrder(v.id, 1)}
                    {...(isLoading ? { disabled: true } : {})}
                  >
                    Buy 1x {v.label}
                  </s-button>
                  <s-text variant="bodySm" tone="subdued">
                    {v.totalQty} available
                  </s-text>
                </s-stack>
              </s-card>
            ))}
          </s-stack>
        )}
      </s-section>

      {/* Orders */}
      <s-section heading={`Orders (${orders.length})`}>
        {orders.length === 0 ? (
          <s-paragraph>No orders yet. Simulate one above.</s-paragraph>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
                <th style={{ padding: "6px" }}>Order ID</th>
                <th style={{ padding: "6px" }}>Total</th>
                <th style={{ padding: "6px" }}>Status</th>
                <th style={{ padding: "6px" }}>Items</th>
                <th style={{ padding: "6px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "6px", fontFamily: "monospace", fontSize: "11px" }}>
                    {o.shopifyId?.replace("gid://shopify/Order/", "") ?? o.id.slice(0, 8)}
                  </td>
                  <td style={{ padding: "6px" }}>${o.total.toFixed(2)}</td>
                  <td style={{ padding: "6px" }}>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: "bold",
                        background:
                          o.status === "open"
                            ? "#e3f5e1"
                            : o.status === "cancelled"
                              ? "#fde8e8"
                              : o.status === "refunded"
                                ? "#fff3cd"
                                : "#eee",
                        color:
                          o.status === "open"
                            ? "#1a7f37"
                            : o.status === "cancelled"
                              ? "#c33"
                              : o.status === "refunded"
                                ? "#856404"
                                : "#666",
                      }}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td style={{ padding: "6px", fontSize: "11px" }}>
                    {o.items.map((item, i) => (
                      <div key={i} style={{ marginBottom: "4px" }}>
                        <div>
                          {item.quantity}x {item.listing.variant.product.title} sz{" "}
                          {item.listing.variant.size} @ ${item.price}
                          {item.quantityRefunded >= item.quantity
                            ? o.status === "cancelled"
                              ? " (cancelled)"
                              : " (refunded)"
                            : item.quantityRefunded > 0
                              ? ` (${item.quantityRefunded} refunded)`
                              : ""}{" "}
                          <span style={{ color: "#999" }}>
                            — {item.listing.consignor.name}
                          </span>
                          {/* Partial refund button for open orders with refundable units */}
                          {o.status === "open" && item.quantity - item.quantityRefunded > 0 && (
                            <button
                              onClick={() =>
                                submitPartialRefund(
                                  o.shopifyId!,
                                  item.listing.variant.shopifyVariantId!,
                                  1
                                )
                              }
                              disabled={isLoading}
                              style={{
                                fontSize: "10px",
                                cursor: "pointer",
                                color: "#856404",
                                marginLeft: "6px",
                                border: "1px solid #856404",
                                borderRadius: "3px",
                                padding: "0 4px",
                                background: "transparent",
                              }}
                            >
                              Refund 1
                            </button>
                          )}
                        </div>
                        {/* Transactions for this order item */}
                        {item.transactions && item.transactions.length > 0 && (
                          <div style={{ marginLeft: "12px", marginTop: "2px" }}>
                            {item.transactions.map((tx: { id: string; type: string; amount: number; grossAmount: number; quantity: number }, ti: number) => (
                              <div
                                key={ti}
                                style={{
                                  fontSize: "10px",
                                  color:
                                    tx.type === "sale"
                                      ? "#1a7f37"
                                      : tx.type === "void"
                                        ? "#c33"
                                        : "#856404",
                                }}
                              >
                                {tx.type.toUpperCase()}: {tx.grossAmount >= 0 ? "+" : ""}${tx.grossAmount.toFixed(2)}{" "}
                                ({tx.quantity} unit{tx.quantity !== 1 ? "s" : ""}, commission{" "}
                                {tx.amount >= 0 ? "+" : ""}${tx.amount.toFixed(2)})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </td>
                  <td style={{ padding: "6px" }}>
                    {o.status === "open" && (
                      <span style={{ display: "flex", gap: "4px", flexDirection: "column" }}>
                        <button
                          onClick={() => submitCancelOrder(o.shopifyId!)}
                          disabled={isLoading}
                          style={{ fontSize: "12px", cursor: "pointer", color: "#c33" }}
                        >
                          Cancel (Void)
                        </button>
                        <button
                          onClick={() => submitRefundOrder(o.shopifyId!)}
                          disabled={isLoading}
                          style={{ fontSize: "12px", cursor: "pointer", color: "#856404" }}
                        >
                          Full Refund
                        </button>
                      </span>
                    )}
                    {o.status !== "open" && (
                      <span style={{ color: "#999", fontSize: "12px" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>

      {/* Consignor Balances */}
      <s-section heading="Consignor Balances">
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
          }}
        >
          <thead>
            <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
              <th style={{ padding: "6px" }}>Consignor</th>
              <th style={{ padding: "6px" }}>Commission Rate</th>
              <th style={{ padding: "6px" }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {consignors.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "6px" }}>{c.name}</td>
                <td style={{ padding: "6px" }}>{(c.commissionRate * 100).toFixed(0)}%</td>
                <td
                  style={{
                    padding: "6px",
                    fontWeight: "bold",
                    color: (balances[c.id] ?? 0) > 0 ? "#1a7f37" : "#333",
                  }}
                >
                  ${(balances[c.id] ?? 0).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </s-section>

      {/* Last response */}
      {fetcher.data && (
        <s-section heading="Last Response">
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <pre style={{ margin: 0, fontSize: "12px", overflow: "auto" }}>
              <code>
                {JSON.stringify(fetcher.data, null, 2)}
              </code>
            </pre>
          </s-box>
        </s-section>
      )}

      {/* Listings summary */}
      <s-section heading={`All Listings (${listings.length})`}>
        {listings.length === 0 ? (
          <s-paragraph>No listings yet.</s-paragraph>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "2px solid #ddd",
                  textAlign: "left",
                }}
              >
                <th style={{ padding: "6px" }}>Product</th>
                <th style={{ padding: "6px" }}>Size</th>
                <th style={{ padding: "6px" }}>Price</th>
                <th style={{ padding: "6px" }}>Qty</th>
                <th style={{ padding: "6px" }}>Consignor</th>
                <th style={{ padding: "6px" }}>Status</th>
                <th style={{ padding: "6px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr
                  key={l.id}
                  style={{ borderBottom: "1px solid #eee" }}
                >
                  <td style={{ padding: "6px" }}>
                    {l.variant.product.title}
                  </td>
                  <td style={{ padding: "6px" }}>{l.variant.size}</td>
                  <td style={{ padding: "6px" }}>${l.price}</td>
                  <td style={{ padding: "6px" }}>{l.quantity}</td>
                  <td style={{ padding: "6px" }}>{l.consignor.name}</td>
                  <td style={{ padding: "6px" }}>{l.status}</td>
                  <td style={{ padding: "6px" }}>
                    {l.status === "active" ? (
                      <span style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                        <button
                          onClick={() => submitCancel(l.id)}
                          disabled={isLoading}
                          style={{ fontSize: "12px", cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                        <input
                          type="number"
                          defaultValue={l.quantity}
                          min={0}
                          style={{ width: "50px", fontSize: "12px", padding: "2px 4px" }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              submitUpdateQty(l.id, e.currentTarget.value);
                            }
                          }}
                        />
                      </span>
                    ) : (
                      <span style={{ color: "#999", fontSize: "12px" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
