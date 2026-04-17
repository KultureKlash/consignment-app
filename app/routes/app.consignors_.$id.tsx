import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { logger } from "~/lib/logger.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getConsignorDetail, updateConsignor, suspendConsignor, unsuspendConsignor, getConsignorVariantIds } from "~/services/consignors.server";
import { syncInventory } from "~/services/inventory.server";
import prisma from "~/db.server";
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
          logger.error("Shopify sync failed for variant", { variantId, error: err instanceof Error ? err.message : String(err) });
        }
      }

      return { success: true, intent, pausedCount };
    }
    if (intent === "unsuspend") {
      const { admin } = await authenticate.admin(request);

      // Get variant IDs of paused listings before reactivating (for Shopify sync)
      const variantIds = await getConsignorVariantIds(id, LISTING_STATUS.PAUSED);

      const { reactivatedCount } = await unsuspendConsignor(id);

      // Re-sync variants to Shopify (inventory goes back up)
      for (const variantId of variantIds) {
        try {
          const variant = await prisma.variant.findUniqueOrThrow({ where: { id: variantId } });
          await syncInventory({ admin, variant });
        } catch (err) {
          logger.error("Shopify sync failed for variant", { variantId, error: err instanceof Error ? err.message : String(err) });
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
      <div className="p-0">
        {/* Top bar: back + view portal */}
        <div className="flex justify-between items-center gap-3 mb-6">
          <Link
            to="/app/consignors"
            className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 no-underline font-medium"
          >
            <ArrowLeft size={16} />
            Back to Consignors
          </Link>
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
            className="admin-btn-secondary flex items-center gap-1.5 !px-4.5 !py-2.5 !text-[13px]"
          >
            <ExternalLink size={14} />
            View Portal
          </button>
        </div>

        {/* Header: name + meta */}
        <div className="mb-7">
          <h1 className="text-xl font-semibold text-gray-900 mb-2 tracking-tight">
            {consignor.name}
          </h1>
          <div className="flex items-center gap-3 text-[13px] text-gray-500 flex-wrap">
            <button
              onClick={handleCopyId}
              className="inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer text-[13px] text-gray-500 font-mono"
              title="Copy ID"
            >
              {copied ? <Check size={12} color="#1a7f37" /> : <Copy size={12} />}
              {consignor.id}
            </button>
            <span className="text-gray-300">|</span>
            <span>Member since {memberSince}</span>
            <span className="text-gray-300">|</span>
            <span className="font-semibold" style={{ color: balance > 0 ? "#1a7f37" : "#333" }}>
              Balance: ${fmt(balance)}
              {consignor.taxStatus === "business" && balance > 0 && (
                <span className="font-normal text-gray-500 text-xs">
                  {" "}(${fmt(computeTax(balance, consignor).total)} with tax)
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Suspension banner */}
        {isSuspended && (
          <div className="flex items-center gap-3 px-5 py-3.5 mb-6 bg-red-50 border border-red-200 rounded-xl">
            <ShieldAlert size={18} color="#dc2626" />
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-red-900 m-0">
                Account Suspended
              </p>
              {consignor.suspensionReason && (
                <p className="text-xs text-red-700 mt-0.5 mb-0">
                  Reason: {consignor.suspensionReason}
                </p>
              )}
            </div>
            <button
              onClick={handleUnsuspend}
              disabled={isSubmitting}
              className="py-1.5 px-4 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg cursor-pointer font-[inherit] transition-all duration-150 hover:bg-emerald-100"
            >
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={13} /> Reactivate
              </span>
            </button>
          </div>
        )}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Details card */}
          <div className="admin-card">
            <div className="admin-card-header">
              <User size={16} color="rgba(109,113,117,0.6)" />
              <h2 className="admin-card-title">Details</h2>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="admin-label">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="admin-input"
                />
              </div>
              <div>
                <label className="admin-label">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="admin-input"
                />
              </div>
              <div>
                <label className="admin-label">Fee Rate (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={feeRatePercent}
                    onChange={(e) => setFeeRatePercent(e.target.value)}
                    className="admin-input pr-8"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">%</span>
                </div>
              </div>
              {/* Store Owned checkbox */}
              <div className="flex items-center gap-2.5 py-1">
                <input
                  type="checkbox"
                  id="storeOwned"
                  checked={storeOwned}
                  onChange={(e) => setStoreOwned(e.target.checked)}
                  className="w-4 h-4 accent-gray-900 cursor-pointer"
                />
                <label htmlFor="storeOwned" className="text-[13px] font-medium text-gray-700 cursor-pointer">
                  Store owned inventory
                </label>
              </div>
              {storeOwned && (
                <p className="text-[11px] text-gray-400 -mt-2 ml-6.5">
                  This account will be excluded from payout workflows.
                </p>
              )}

              {/* Tax Status */}
              <div className="border-t border-gray-200/40 pt-4">
                <label className="admin-label">Tax Status</label>
                <div className="flex gap-2">
                  {(["individual", "business"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setTaxStatus(status)}
                      className={`flex-1 py-2 px-3 text-[13px] font-medium rounded-lg border cursor-pointer transition-all duration-150 ${
                        taxStatus === status
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-300 bg-white text-gray-700"
                      }`}
                    >
                      {status === "individual" ? "Individual" : "Registered Business"}
                    </button>
                  ))}
                </div>
              </div>

              {taxStatus === "business" && (
                <>
                  <div>
                    <label className="admin-label">Province</label>
                    <select
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      className="admin-input cursor-pointer"
                    >
                      <option value="QC">Quebec (QC)</option>
                      <option value="ON">Ontario (ON)</option>
                    </select>
                  </div>
                  <div>
                    <label className="admin-label">GST/HST Number</label>
                    <input
                      type="text"
                      value={gstNumber}
                      onChange={(e) => setGstNumber(e.target.value)}
                      className="admin-input"
                      placeholder="e.g. 123456789 RT0001"
                    />
                  </div>
                  {province === "QC" && (
                    <div>
                      <label className="admin-label">QST Number</label>
                      <input
                        type="text"
                        value={qstNumber}
                        onChange={(e) => setQstNumber(e.target.value)}
                        className="admin-input"
                        placeholder="e.g. 1234567890 TQ0001"
                      />
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 -mt-1">
                    Business consignors invoice with GST{province === "QC" ? "/QST" : ""} on their payout.
                  </p>
                </>
              )}

              {/* Save */}
              <div className="border-t border-gray-200/40 pt-4">
                <button
                  onClick={handleSave}
                  disabled={isSubmitting || !hasChanges}
                  className={`admin-btn-primary w-full !py-2.5 !text-[13px] tracking-wide ${
                    !hasChanges ? "!bg-gray-400 !cursor-default !shadow-none hover:!bg-gray-400 hover:!shadow-none hover:!translate-y-0" : ""
                  } ${isSubmitting ? "opacity-70" : ""}`}
                >
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>

          {/* Listings Summary card */}
          <div className="admin-card">
            <div className="admin-card-header">
              <BarChart3 size={16} color="rgba(109,113,117,0.6)" />
              <h2 className="admin-card-title">Listings Summary</h2>
              <span className="ml-auto text-[11px] font-semibold text-gray-500">
                {totalListings} total
              </span>
            </div>
            <div>
              <div className="flex justify-between items-center px-6 py-2.5 text-[13px] border-b border-gray-200/30">
                <span className="flex items-center">
                  <span className="w-2 h-2 rounded-full inline-block mr-2" style={{ background: "#1a7f37" }} />
                  Active
                </span>
                <span className="font-semibold tabular-nums">{counts.active}</span>
              </div>
              {(counts.paused ?? 0) > 0 && (
                <div className="flex justify-between items-center px-6 py-2.5 text-[13px] border-b border-gray-200/30">
                  <span className="flex items-center">
                    <span className="w-2 h-2 rounded-full inline-block mr-2" style={{ background: "#dc2626" }} />
                    Paused
                  </span>
                  <span className="font-semibold tabular-nums">{counts.paused}</span>
                </div>
              )}
              <div className="flex justify-between items-center px-6 py-2.5 text-[13px] border-b border-gray-200/30">
                <span className="flex items-center">
                  <span className="w-2 h-2 rounded-full inline-block mr-2" style={{ background: "#b86e00" }} />
                  Pending Sale
                </span>
                <span className="font-semibold tabular-nums">{counts.pending_sale}</span>
              </div>
              <div className="flex justify-between items-center px-6 py-2.5 text-[13px] border-b border-gray-200/30">
                <span className="flex items-center">
                  <span className="w-2 h-2 rounded-full inline-block mr-2" style={{ background: "#2c6ecb" }} />
                  Sold
                </span>
                <span className="font-semibold tabular-nums">{counts.sold}</span>
              </div>
              <div className="flex justify-between items-center px-6 py-2.5 text-[13px]">
                <span className="flex items-center">
                  <span className="w-2 h-2 rounded-full inline-block mr-2" style={{ background: "#6d7175" }} />
                  Cancelled
                </span>
                <span className="font-semibold tabular-nums">{counts.cancelled}</span>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200/50">
              <Link
                to={`/app/payouts?consignor=${consignor.id}`}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-indigo-600 no-underline"
              >
                View sales & payouts →
              </Link>
            </div>
          </div>
        </div>

        {/* Suspend button (for active consignors only) */}
        {!isSuspended && (
          <div className="mt-7 pt-5 border-t border-gray-200/40">
            <button
              onClick={() => setShowSuspendModal(true)}
              className="admin-btn-ghost inline-flex items-center gap-1.5 !text-red-600 border border-red-200 hover:!bg-red-50 hover:border-red-300"
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
          className="admin-modal-overlay"
          onClick={() => setShowSuspendModal(false)}
        >
          <div
            className="admin-modal !max-w-[440px] !mx-4 md:!mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h2 className="m-0 text-[15px] font-semibold text-gray-900 flex items-center gap-2">
                <ShieldAlert size={16} color="#dc2626" />
                Suspend Consignor
              </h2>
              <button
                onClick={() => setShowSuspendModal(false)}
                className="bg-transparent border-0 cursor-pointer p-1 text-gray-500"
              >
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body">
              <p className="text-[13px] text-gray-700 mb-4 leading-relaxed">
                This will block <strong>{consignor.name}</strong> from logging into the portal, submitting listings, and making changes.
              </p>
              <div>
                <label className="admin-label">Reason (optional)</label>
                <input
                  type="text"
                  value={suspensionReason}
                  onChange={(e) => setSuspensionReason(e.target.value)}
                  className="admin-input"
                  placeholder="e.g. Repeated policy violations"
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-2.5 mt-1">
                <input
                  type="checkbox"
                  id="pauseListings"
                  checked={pauseListings}
                  onChange={(e) => setPauseListings(e.target.checked)}
                  className="w-4 h-4 accent-red-600 cursor-pointer"
                />
                <label htmlFor="pauseListings" className="text-[13px] font-medium text-gray-700 cursor-pointer">
                  Pause active listings
                </label>
              </div>
              <p className="text-[11px] text-gray-400 mt-1 ml-6.5">
                Paused listings are removed from the store and restored when the account is reactivated.
              </p>
            </div>
            <div className="admin-modal-footer">
              <button
                onClick={() => setShowSuspendModal(false)}
                className="admin-btn-secondary !px-4 !py-2 !text-[13px]"
              >
                Cancel
              </button>
              <button
                onClick={handleSuspend}
                disabled={isSubmitting}
                className={`admin-btn-danger !px-5 !py-2 !text-[13px] ${isSubmitting ? "opacity-70" : ""}`}
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
