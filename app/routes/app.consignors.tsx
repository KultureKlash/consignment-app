import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getConsignorBalance } from "~/services/orders.server";
import { createConsignor } from "~/services/consignors.server";
import { inputStyle, labelStyle, handleFocus, handleBlurStyle } from "~/lib/listing-ui";
import prisma from "~/db.server";
import { fmt } from "~/lib/currency";
import { ChevronRight, Plus, X } from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const consignors = await prisma.consignor.findMany({ orderBy: { name: "asc" } });

  const balances: Record<string, number> = {};
  for (const c of consignors) {
    balances[c.id] = await getConsignorBalance(c.id);
  }

  return { consignors, balances };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "create") {
      const { createConsignorSchema, parseForm } = await import("~/lib/validation");
      const data = parseForm(createConsignorSchema, formData);

      await createConsignor({ name: data.name, email: data.email, feeRate: data.feeRate / 100 });
      return { success: true, intent };
    }
    throw new Error("Invalid intent");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message, intent };
  }
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
};

const modalCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: "14px",
  boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  width: "100%",
  maxWidth: "440px",
  overflow: "hidden",
};

export default function Consignors() {
  const { consignors, balances } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [feeRate, setFeeRate] = useState("15");

  const isSubmitting = ["loading", "submitting"].includes(fetcher.state);

  useEffect(() => {
    const data = fetcher.data as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.error) {
      shopify.toast.show(data.error as string);
    } else if (data.success && data.intent === "create") {
      shopify.toast.show("Consignor created");
      setShowModal(false);
      setName("");
      setEmail("");
      setFeeRate("15");
    }
  }, [fetcher.data, shopify]);

  const handleCreate = () => {
    fetcher.submit(
      { intent: "create", name, email, feeRate },
      { method: "POST" },
    );
  };

  const canSubmit = name.trim() && email.trim() && !isNaN(parseFloat(feeRate));

  return (
    <s-page heading="Consignors">
      <s-section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <span style={{ fontSize: "13px", color: "#6d7175" }}>
            {consignors.length} consignor{consignors.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#fff",
              background: "#111827",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#1f2937"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#111827"; }}
          >
            <Plus size={14} />
            Add Consignor
          </button>
        </div>

        {consignors.length === 0 ? (
          <s-paragraph>No consignors yet. Add one to get started.</s-paragraph>
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
                  <td style={{ padding: "6px", fontWeight: 500 }}>
                    {c.name}
                    {c.storeOwned && (
                      <span style={{
                        marginLeft: "8px",
                        padding: "2px 8px",
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "#6d7175",
                        background: "#f3f4f6",
                        border: "1px solid #e5e7eb",
                        borderRadius: "9999px",
                        textTransform: "uppercase",
                        letterSpacing: "0.03em",
                      }}>
                        Store
                      </span>
                    )}
                    {c.status === "suspended" && (
                      <span style={{
                        marginLeft: "8px",
                        padding: "2px 8px",
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "#dc2626",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        borderRadius: "9999px",
                        textTransform: "uppercase",
                        letterSpacing: "0.03em",
                      }}>
                        Suspended
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "6px" }}>{c.email}</td>
                  <td style={{ padding: "6px" }}>{(c.feeRate * 100).toFixed(0)}%</td>
                  <td
                    style={{
                      padding: "6px",
                      fontWeight: "bold",
                      color: (balances[c.id] ?? 0) > 0 ? "#1a7f37" : "#333",
                    }}
                  >
                    ${fmt(balances[c.id] ?? 0)}
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

      {showModal && (
        <div style={modalOverlay} onClick={() => setShowModal(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#1a1a1a" }}>Add Consignor</h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "#6d7175" }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={handleFocus}
                  onBlur={handleBlurStyle}
                  style={inputStyle}
                  placeholder="Full name"
                  autoFocus
                />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={handleFocus}
                  onBlur={handleBlurStyle}
                  style={inputStyle}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label style={labelStyle}>Fee Rate (%)</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={feeRate}
                    onChange={(e) => setFeeRate(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlurStyle}
                    style={{ ...inputStyle, paddingRight: "32px" }}
                  />
                  <span style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "#6d7175", fontSize: "14px", pointerEvents: "none" }}>%</span>
                </div>
                <span style={{ fontSize: "11px", color: "#8c9196", marginTop: "4px", display: "block" }}>
                  Platform fee deducted from sales. Consignor keeps {100 - (parseFloat(feeRate) || 0)}%.
                </span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid #e5e7eb" }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#374151",
                  background: "#f3f4f6",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!canSubmit || isSubmitting}
                style={{
                  padding: "8px 20px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#fff",
                  background: canSubmit ? "#111827" : "#9ca3af",
                  border: "none",
                  borderRadius: "8px",
                  cursor: canSubmit ? "pointer" : "default",
                  opacity: isSubmitting ? 0.7 : 1,
                  fontFamily: "inherit",
                  transition: "all 0.15s ease",
                }}
              >
                {isSubmitting ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
