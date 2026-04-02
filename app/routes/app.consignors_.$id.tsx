import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getConsignorDetail, updateConsignor, suspendConsignor, unsuspendConsignor, getConsignorVariantIds } from "~/services/consignors.server";
import { syncInventory } from "~/services/inventory.server";
import prisma from "~/db.server";
import { inputStyle, labelStyle, handleFocus, handleBlurStyle } from "~/lib/admin/listing-ui";
import { ArrowLeft, Copy, Check, User, BarChart3, ShieldAlert, ShieldCheck, X, ExternalLink } from "lucide-react";
import { fmt } from "~/lib/currency";
import { computeTax } from "~/lib/tax";

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
      const { updateConsignorSchema, parseForm } = await import("~/lib/validation");
      const data = parseForm(updateConsignorSchema, formData);

      await updateConsignor(id, {
        name: data.name,
        email: data.email,
        feeRate: data.feeRate,
        storeOwned: data.storeOwned ?? false,
        taxStatus: data.taxStatus,
        gstNumber: data.gstNumber,
        qstNumber: data.qstNumber,
        province: data.province,
      });
      return { success: true, intent };
    }
    if (intent === "suspend") {
      const { admin } = await authenticate.admin(request);
      const reason = (formData.get("reason") as string ?? "").trim();
      const pauseListings = formData.get("pauseListings") === "true";

      // Get affected variant IDs before pausing (for Shopify sync)
      const variantIds = pauseListings ? await getConsignorVariantIds(id, "active") : [];

      const { pausedCount } = await suspendConsignor(id, reason || undefined, pauseListings);

      // Sync affected variants to Shopify (inventory drops to 0)
      for (const variantId of variantIds) {
        try {
          const variant = await prisma.variant.findUniqueOrThrow({ where: { id: variantId } });
          await syncInventory({ admin, variant });
        } catch (err) {
          console.error(`Shopify sync failed for variant ${variantId}:`, err);
        }
      }

      return { success: true, intent, pausedCount };
    }
    if (intent === "unsuspend") {
      const { admin } = await authenticate.admin(request);

      // Get variant IDs of paused listings before reactivating (for Shopify sync)
      const variantIds = await getConsignorVariantIds(id, "paused");

      const { reactivatedCount } = await unsuspendConsignor(id);

      // Re-sync variants to Shopify (inventory goes back up)
      for (const variantId of variantIds) {
        try {
          const variant = await prisma.variant.findUniqueOrThrow({ where: { id: variantId } });
          await syncInventory({ admin, variant });
        } catch (err) {
          console.error(`Shopify sync failed for variant ${variantId}:`, err);
        }
      }

      return { success: true, intent, reactivatedCount };
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
  const [storeOwned, setStoreOwned] = useState(consignor.storeOwned);
  const [taxStatus, setTaxStatus] = useState(consignor.taxStatus || "individual");
  const [gstNumber, setGstNumber] = useState(consignor.gstNumber || "");
  const [qstNumber, setQstNumber] = useState(consignor.qstNumber || "");
  const [province, setProvince] = useState(consignor.province || "QC");
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState("");
  const [pauseListings, setPauseListings] = useState(true);

  const isSubmitting = ["loading", "submitting"].includes(fetcher.state);

  // Check if form has changes
  const hasChanges =
    name !== consignor.name ||
    email !== consignor.email ||
    feeRatePercent !== String(Math.round(consignor.feeRate * 100)) ||
    storeOwned !== consignor.storeOwned ||
    taxStatus !== (consignor.taxStatus || "individual") ||
    gstNumber !== (consignor.gstNumber || "") ||
    qstNumber !== (consignor.qstNumber || "") ||
    province !== (consignor.province || "QC");

  useEffect(() => {
    const data = fetcher.data as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.error) {
      shopify.toast.show(data.error as string);
    } else if (data.success) {
      if (data.intent === "suspend") {
        const pc = data.pausedCount as number;
        shopify.toast.show(pc > 0 ? `Consignor suspended — ${pc} listing${pc !== 1 ? "s" : ""} paused` : "Consignor suspended");
        setShowSuspendModal(false);
        setSuspensionReason("");
        setPauseListings(true);
      } else if (data.intent === "unsuspend") {
        const rc = data.reactivatedCount as number;
        shopify.toast.show(rc > 0 ? `Consignor reactivated — ${rc} listing${rc !== 1 ? "s" : ""} restored` : "Consignor reactivated");
      } else {
        shopify.toast.show("Consignor updated");
      }
    }
  }, [fetcher.data, shopify]);

  const handleCopyId = () => {
    navigator.clipboard.writeText(consignor.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    fetcher.submit(
      {
        intent: "update",
        name,
        email,
        feeRate: String(parseFloat(feeRatePercent) / 100),
        storeOwned: String(storeOwned),
        taxStatus,
        gstNumber: taxStatus === "business" ? gstNumber : "",
        qstNumber: taxStatus === "business" ? qstNumber : "",
        province: taxStatus === "business" ? province : "",
      },
      { method: "POST" },
    );
  };

  const handleSuspend = () => {
    fetcher.submit(
      { intent: "suspend", reason: suspensionReason, pauseListings: String(pauseListings) },
      { method: "POST" },
    );
  };

  const handleUnsuspend = () => {
    fetcher.submit({ intent: "unsuspend" }, { method: "POST" });
  };

  const isSuspended = consignor.status === "suspended";

  const memberSince = new Date(consignor.createdAt).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  const totalListings = counts.active + (counts.paused ?? 0) + counts.pending_sale + counts.sold + counts.cancelled;

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
          <button
            onClick={() => {
              fetch("/app/api/impersonate", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `consignorId=${encodeURIComponent(consignor.id)}`,
              })
                .then((r) => r.json())
                .then((data) => { if (data.url) window.open(data.url, "_blank"); })
                .catch(() => shopify.toast.show("Failed to open portal"));
            }}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "10px 18px", fontSize: "13px", fontWeight: 500,
              color: "#6d7175", background: "rgba(17,24,39,0.04)",
              border: "1px solid rgba(17,24,39,0.12)", borderRadius: "10px",
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(17,24,39,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(17,24,39,0.04)"; }}
          >
            <ExternalLink size={14} />
            View Portal
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
              Balance: ${fmt(balance)}
              {consignor.taxStatus === "business" && balance > 0 && (
                <span style={{ fontWeight: 400, color: "#6d7175", fontSize: "12px" }}>
                  {" "}(${fmt(computeTax(balance, consignor).total)} with tax)
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Suspension banner */}
        {isSuspended && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 20px",
            marginBottom: "24px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "12px",
          }}>
            <ShieldAlert size={18} color="#dc2626" />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "#991b1b", margin: 0 }}>
                Account Suspended
              </p>
              {consignor.suspensionReason && (
                <p style={{ fontSize: "12px", color: "#b91c1c", margin: "2px 0 0" }}>
                  Reason: {consignor.suspensionReason}
                </p>
              )}
            </div>
            <button
              onClick={handleUnsuspend}
              disabled={isSubmitting}
              style={{
                padding: "7px 16px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#065f46",
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                borderRadius: "8px",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#d1fae5"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#ecfdf5"; }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <ShieldCheck size={13} /> Reactivate
              </span>
            </button>
          </div>
        )}

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
                    min="0"
                    max="100"
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
              {/* Store Owned checkbox */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "4px 0" }}>
                <input
                  type="checkbox"
                  id="storeOwned"
                  checked={storeOwned}
                  onChange={(e) => setStoreOwned(e.target.checked)}
                  style={{ width: "16px", height: "16px", accentColor: "#111827", cursor: "pointer" }}
                />
                <label htmlFor="storeOwned" style={{ fontSize: "13px", fontWeight: 500, color: "#374151", cursor: "pointer" }}>
                  Store owned inventory
                </label>
              </div>
              {storeOwned && (
                <p style={{ fontSize: "11px", color: "#9ca3af", margin: "-8px 0 0 26px" }}>
                  This account will be excluded from payout workflows.
                </p>
              )}

              {/* Tax Status */}
              <div style={{ borderTop: "1px solid rgba(227,227,227,0.4)", paddingTop: "16px" }}>
                <label style={labelStyle}>Tax Status</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {(["individual", "business"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setTaxStatus(status)}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        fontSize: "13px",
                        fontWeight: 500,
                        borderRadius: "8px",
                        border: `1px solid ${taxStatus === status ? "#111827" : "#c4c9d1"}`,
                        background: taxStatus === status ? "#111827" : "#fff",
                        color: taxStatus === status ? "#fff" : "#374151",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {status === "individual" ? "Individual" : "Registered Business"}
                    </button>
                  ))}
                </div>
              </div>

              {taxStatus === "business" && (
                <>
                  <div>
                    <label style={labelStyle}>Province</label>
                    <select
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      onFocus={handleFocus as any}
                      onBlur={handleBlurStyle as any}
                      style={{ ...inputStyle, cursor: "pointer" }}
                    >
                      <option value="QC">Quebec (QC)</option>
                      <option value="ON">Ontario (ON)</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>GST/HST Number</label>
                    <input
                      type="text"
                      value={gstNumber}
                      onChange={(e) => setGstNumber(e.target.value)}
                      onFocus={handleFocus}
                      onBlur={handleBlurStyle}
                      style={inputStyle}
                      placeholder="e.g. 123456789 RT0001"
                    />
                  </div>
                  {province === "QC" && (
                    <div>
                      <label style={labelStyle}>QST Number</label>
                      <input
                        type="text"
                        value={qstNumber}
                        onChange={(e) => setQstNumber(e.target.value)}
                        onFocus={handleFocus}
                        onBlur={handleBlurStyle}
                        style={inputStyle}
                        placeholder="e.g. 1234567890 TQ0001"
                      />
                    </div>
                  )}
                  <p style={{ fontSize: "11px", color: "#9ca3af", margin: "-4px 0 0 0" }}>
                    Business consignors invoice with GST{province === "QC" ? "/QST" : ""} on their payout.
                  </p>
                </>
              )}
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
              {(counts.paused ?? 0) > 0 && (
                <div style={statRow}>
                  <span style={{ display: "flex", alignItems: "center" }}>
                    <span style={statusDot("#dc2626")} />
                    Paused
                  </span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{counts.paused}</span>
                </div>
              )}
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
                to={`/app/payouts?consignor=${consignor.id}`}
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

        {/* Suspend button (for active consignors only) */}
        {!isSuspended && (
          <div style={{ marginTop: "28px", paddingTop: "20px", borderTop: "1px solid rgba(227,227,227,0.4)" }}>
            <button
              onClick={() => setShowSuspendModal(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#dc2626",
                background: "transparent",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#fca5a5"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "#fecaca"; }}
            >
              <ShieldAlert size={14} />
              Suspend Account
            </button>
          </div>
        )}
      </div>

      {/* Suspend confirmation modal */}
      {showSuspendModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setShowSuspendModal(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "14px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              width: "100%",
              maxWidth: "440px",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#1a1a1a", display: "flex", alignItems: "center", gap: "8px" }}>
                <ShieldAlert size={16} color="#dc2626" />
                Suspend Consignor
              </h2>
              <button
                onClick={() => setShowSuspendModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "#6d7175" }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: "20px" }}>
              <p style={{ fontSize: "13px", color: "#374151", margin: "0 0 16px", lineHeight: 1.5 }}>
                This will block <strong>{consignor.name}</strong> from logging into the portal, submitting listings, and making changes.
              </p>
              <div>
                <label style={labelStyle}>Reason (optional)</label>
                <input
                  type="text"
                  value={suspensionReason}
                  onChange={(e) => setSuspensionReason(e.target.value)}
                  onFocus={handleFocus}
                  onBlur={handleBlurStyle}
                  style={inputStyle}
                  placeholder="e.g. Repeated policy violations"
                  autoFocus
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                <input
                  type="checkbox"
                  id="pauseListings"
                  checked={pauseListings}
                  onChange={(e) => setPauseListings(e.target.checked)}
                  style={{ width: "16px", height: "16px", accentColor: "#dc2626", cursor: "pointer" }}
                />
                <label htmlFor="pauseListings" style={{ fontSize: "13px", fontWeight: 500, color: "#374151", cursor: "pointer" }}>
                  Pause active listings
                </label>
              </div>
              <p style={{ fontSize: "11px", color: "#9ca3af", margin: "4px 0 0 26px" }}>
                Paused listings are removed from the store and restored when the account is reactivated.
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "16px 20px", borderTop: "1px solid #e5e7eb" }}>
              <button
                onClick={() => setShowSuspendModal(false)}
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
                onClick={handleSuspend}
                disabled={isSubmitting}
                style={{
                  padding: "8px 20px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#fff",
                  background: "#dc2626",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  opacity: isSubmitting ? 0.7 : 1,
                  fontFamily: "inherit",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#b91c1c"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#dc2626"; }}
              >
                {isSubmitting ? "Suspending..." : "Suspend"}
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
