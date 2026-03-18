import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const orders = await prisma.order.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
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
  });

  return { orders };
};

export default function Orders() {
  const { orders } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Orders">
      <s-section>
        <s-paragraph>
          Manage orders in Shopify Admin. Refunds and cancellations sync automatically via webhooks.
        </s-paragraph>
      </s-section>

      <s-section heading={`Orders (${orders.length})`}>
        {orders.length === 0 ? (
          <s-paragraph>No orders yet.</s-paragraph>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
                <th style={{ padding: "6px" }}>Order ID</th>
                <th style={{ padding: "6px" }}>Total</th>
                <th style={{ padding: "6px" }}>Status</th>
                <th style={{ padding: "6px" }}>Payment</th>
                <th style={{ padding: "6px" }}>Items</th>
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
                          o.status === "open" ? "#e3f5e1"
                            : o.status === "cancelled" ? "#fde8e8"
                            : o.status === "refunded" ? "#fff3cd"
                            : "#eee",
                        color:
                          o.status === "open" ? "#1a7f37"
                            : o.status === "cancelled" ? "#c33"
                            : o.status === "refunded" ? "#856404"
                            : "#666",
                      }}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td style={{ padding: "6px" }}>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: "bold",
                        background: o.paymentStatus === "paid" ? "#e3f5e1" : "#fff3cd",
                        color: o.paymentStatus === "paid" ? "#1a7f37" : "#856404",
                      }}
                    >
                      {o.paymentStatus}
                    </span>
                  </td>
                  <td style={{ padding: "6px", fontSize: "11px" }}>
                    {o.items.map((item, i) => (
                      <div key={i} style={{ marginBottom: "4px" }}>
                        <div>
                          {item.listing.variant.product.title} sz{" "}
                          {item.listing.variant.size} @ ${item.price}
                          {item.status === "refunded"
                            ? o.status === "cancelled" ? " (cancelled)" : " (refunded)"
                            : ""}{" "}
                          <span style={{ color: "#999" }}>— {item.listing.consignor.name}</span>
                        </div>
                        {item.transactions && item.transactions.length > 0 && (
                          <div style={{ marginLeft: "12px", marginTop: "2px" }}>
                            {item.transactions.map((tx: { id: string; type: string; amount: number; grossAmount: number }, ti: number) => (
                              <div
                                key={ti}
                                style={{
                                  fontSize: "10px",
                                  color:
                                    tx.type === "sale" ? "#1a7f37"
                                      : tx.type === "void" ? "#c33"
                                      : "#856404",
                                }}
                              >
                                {tx.type.toUpperCase()}: {tx.grossAmount >= 0 ? "+" : ""}${tx.grossAmount.toFixed(2)}{" "}
                                (commission {tx.amount >= 0 ? "+" : ""}${tx.amount.toFixed(2)})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
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
