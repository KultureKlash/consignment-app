import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getConsignorDetail, updateConsignor } from "~/services/consignors.server";
import { inputStyle, labelStyle, handleFocus, handleBlurStyle } from "~/lib/listing-ui";
import { ArrowLeft, Copy, Check, User, BarChart3 } from "lucide-react";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const id = params.id!;
  return getConsignorDetail(id);
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const id = params.id!;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "update") {
      const name = (formData.get("name") as string ?? "").trim();
      const email = (formData.get("email") as string ?? "").trim();
      const feeRate = parseFloat(formData.get("feeRate") as string);

      if (!name) return { error: "Name is required", intent };
      if (!email) return { error: "Email is required", intent };
      if (isNaN(feeRate)) return { error: "Invalid fee rate", intent };

      await updateConsignor(id, { name, email, feeRate });
      return { success: true, intent };
    }
    throw new Error("Invalid intent");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message, intent };
  }
};

const sectionCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(227,227,227,0.6)",
  borderRadius: "12px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  overflow: "hidden",
};

const sectionHeader: React.CSSProperties = {
  padding: "16px 24px",
  borderBottom: "1px solid rgba(227,227,227,0.5)",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#1a1a1a",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  margin: 0,
};

const statRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 24px",
  fontSize: "13px",
  borderBottom: "1px solid rgba(227,227,227,0.3)",
};

const statusDot = (color: string): React.CSSProperties => ({
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: color,
  display: "inline-block",
  marginRight: "8px",
});

export default function ConsignorDetail() {
  const { consignor, balance, counts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [copied, setCopied] = useState(false);

  const [name, setName] = useState(consignor.name);
  const [email, setEmail] = useState(consignor.email);
  const [feeRatePercent, setFeeRatePercent] = useState(String(Math.round(consignor.feeRate * 100)));

  const isSubmitting = ["loading", "submitting"].includes(fetcher.state);

  // Check if form has changes
  const hasChanges =
    name !== consignor.name ||
    email !== consignor.email ||
    feeRatePercent !== String(Math.round(consignor.feeRate * 100));

  useEffect(() => {
    const data = fetcher.data as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.error) {
      shopify.toast.show(data.error as string);
    } else if (data.success) {
      shopify.toast.show("Consignor updated");
    }
  }, [fetcher.data, shopify]);

  const handleCopyId = () => {
    navigator.clipboard.writeText(consignor.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    fetcher.submit(
      { intent: "update", name, email, feeRate: String(parseFloat(feeRatePercent) / 100) },
      { method: "POST" },
    );
  };

  const memberSince = new Date(consignor.createdAt).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  const totalListings = counts.active + counts.pending_sale + counts.sold + counts.cancelled;

  return (
    <s-page>
      <div style={{ padding: "0" }}>
        {/* Top bar: back + save */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <Link
            to="/app/consignors"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "13px",
              color: "#6d7175",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={16} />
            Back to Consignors
          </Link>
          <button
            onClick={handleSave}
            disabled={isSubmitting || !hasChanges}
            style={{
              padding: "10px 24px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#fff",
              background: hasChanges ? "#111827" : "#9ca3af",
              border: "none",
              borderRadius: "10px",
              cursor: hasChanges ? "pointer" : "default",
              opacity: isSubmitting ? 0.7 : 1,
              transition: "all 0.2s ease",
              fontFamily: "inherit",
              boxShadow: hasChanges ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={(e) => { if (hasChanges && !isSubmitting) { e.currentTarget.style.background = "#1f2937"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.25)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
            onMouseLeave={(e) => { if (hasChanges && !isSubmitting) { e.currentTarget.style.background = "#111827"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)"; e.currentTarget.style.transform = "translateY(0)"; } }}
          >
            {isSubmitting ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {/* Header: name + meta */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#1a1a1a", margin: "0 0 8px 0", letterSpacing: "-0.02em" }}>
            {consignor.name}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "13px", color: "#6d7175", flexWrap: "wrap" }}>
            <button
              onClick={handleCopyId}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: "13px",
                color: "#6d7175",
                fontFamily: "monospace",
              }}
              title="Copy ID"
            >
              {copied ? <Check size={12} color="#1a7f37" /> : <Copy size={12} />}
              {consignor.id}
            </button>
            <span style={{ color: "#d1d5db" }}>|</span>
            <span>Member since {memberSince}</span>
            <span style={{ color: "#d1d5db" }}>|</span>
            <span style={{ fontWeight: 600, color: balance > 0 ? "#1a7f37" : "#333" }}>
              Balance: ${balance.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          {/* Details card */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <User size={16} color="rgba(109,113,117,0.6)" />
              <h2 style={sectionTitle}>Details</h2>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={handleFocus}
                  onBlur={handleBlurStyle}
                  style={inputStyle}
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
                />
              </div>
              <div>
                <label style={labelStyle}>Fee Rate (%)</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    step="1"
                    value={feeRatePercent}
                    onChange={(e) => setFeeRatePercent(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlurStyle}
                    style={{ ...inputStyle, paddingRight: "32px" }}
                  />
                  <span style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "#6d7175", fontSize: "14px", pointerEvents: "none" }}>%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Listings Summary card */}
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <BarChart3 size={16} color="rgba(109,113,117,0.6)" />
              <h2 style={sectionTitle}>Listings Summary</h2>
              <span style={{
                marginLeft: "auto",
                fontSize: "11px",
                fontWeight: 600,
                color: "#6d7175",
              }}>
                {totalListings} total
              </span>
            </div>
            <div>
              <div style={statRow}>
                <span style={{ display: "flex", alignItems: "center" }}>
                  <span style={statusDot("#1a7f37")} />
                  Active
                </span>
                <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{counts.active}</span>
              </div>
              <div style={statRow}>
                <span style={{ display: "flex", alignItems: "center" }}>
                  <span style={statusDot("#b86e00")} />
                  Pending Sale
                </span>
                <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{counts.pending_sale}</span>
              </div>
              <div style={statRow}>
                <span style={{ display: "flex", alignItems: "center" }}>
                  <span style={statusDot("#2c6ecb")} />
                  Sold
                </span>
                <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{counts.sold}</span>
              </div>
              <div style={{ ...statRow, borderBottom: "none" }}>
                <span style={{ display: "flex", alignItems: "center" }}>
                  <span style={statusDot("#6d7175")} />
                  Cancelled
                </span>
                <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{counts.cancelled}</span>
              </div>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(227,227,227,0.5)" }}>
              <Link
                to="/app/payouts"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#4f46e5",
                  textDecoration: "none",
                }}
              >
                View sales & payouts →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
