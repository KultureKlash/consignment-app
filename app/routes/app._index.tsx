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

  return { consignors, listings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string ?? "create";

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
};

export default function Index() {
  const { consignors, listings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [selectedConsignor, setSelectedConsignor] = useState(
    consignors[0]?.id ?? ""
  );

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.listing?.id) {
      const messages: Record<string, string> = {
        create: "Listing created",
        cancel: "Listing cancelled",
        updateQuantity: "Quantity updated",
      };
      shopify.toast.show(messages[fetcher.data.intent] ?? "Done");
    }
  }, [fetcher.data?.listing?.id, shopify, fetcher.data?.intent]);

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
                {c.name} ({(c.commissionRate * 100).toFixed(0)}%)
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

      {/* Last response */}
      {fetcher.data?.listing && (
        <s-section heading="Last Response">
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <pre style={{ margin: 0, fontSize: "12px", overflow: "auto" }}>
              <code>
                {JSON.stringify(fetcher.data.listing, null, 2)}
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
