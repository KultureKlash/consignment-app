import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getConsignorBalance } from "~/services/orders.server";
import prisma from "~/db.server";
import { ChevronRight } from "lucide-react";

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
  const navigate = useNavigate();

  return (
    <s-page heading="Consignors">
      <s-section>
        <div style={{ marginBottom: "8px", fontSize: "13px", color: "#6d7175" }}>
          {consignors.length} consignor{consignors.length !== 1 ? "s" : ""}
        </div>
        {consignors.length === 0 ? (
          <s-paragraph>No consignors yet.</s-paragraph>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
                <th style={{ padding: "6px" }}>Name</th>
                <th style={{ padding: "6px" }}>Email</th>
                <th style={{ padding: "6px" }}>Fee Rate</th>
                <th style={{ padding: "6px" }}>Balance</th>
                <th style={{ padding: "6px", width: "32px" }} />
              </tr>
            </thead>
            <tbody>
              {consignors.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/app/consignors/${c.id}`)}
                  style={{ borderBottom: "1px solid #eee", cursor: "pointer", transition: "background 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f8f9fa"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td style={{ padding: "6px", fontWeight: 500 }}>{c.name}</td>
                  <td style={{ padding: "6px" }}>{c.email}</td>
                  <td style={{ padding: "6px" }}>{(c.feeRate * 100).toFixed(0)}%</td>
                  <td
                    style={{
                      padding: "6px",
                      fontWeight: "bold",
                      color: (balances[c.id] ?? 0) > 0 ? "#1a7f37" : "#333",
                    }}
                  >
                    ${(balances[c.id] ?? 0).toFixed(2)}
                  </td>
                  <td style={{ padding: "6px", color: "#9ca3af" }}>
                    <ChevronRight size={16} />
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
