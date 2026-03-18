import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getConsignorBalance } from "~/services/orders.server";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const consignors = await prisma.consignor.findMany({ orderBy: { name: "asc" } });

  const balances: Record<string, number> = {};
  for (const c of consignors) {
    balances[c.id] = await getConsignorBalance(c.id);
  }

  return { consignors, balances };
};

export default function Consignors() {
  const { consignors, balances } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Consignors">
      <s-section>
        {consignors.length === 0 ? (
          <s-paragraph>No consignors yet.</s-paragraph>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
                <th style={{ padding: "6px" }}>Name</th>
                <th style={{ padding: "6px" }}>Email</th>
                <th style={{ padding: "6px" }}>Commission Rate</th>
                <th style={{ padding: "6px" }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {consignors.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "6px" }}>{c.name}</td>
                  <td style={{ padding: "6px" }}>{c.email}</td>
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
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
