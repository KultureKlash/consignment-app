import { Link, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Check, ShieldAlert, ShieldCheck, X, ExternalLink } from "lucide-react";
import { fmt } from "~/lib/currency";
import { computeTax } from "~/lib/tax";
import { ConsignorForm } from "./ConsignorForm";
import { ConsignorListingsSummary } from "./ConsignorListingsSummary";
import type { loader } from "~/routes/app.consignors_.$id";

type LoaderData = Awaited<ReturnType<typeof loader>>;

interface ConsignorDetailPageProps {
  loaderData: LoaderData;
}

export function ConsignorDetailPage({ loaderData }: ConsignorDetailPageProps) {
  const { consignor, balance, counts } = loaderData;
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
          <ConsignorForm
            name={name}
            email={email}
            feeRatePercent={feeRatePercent}
            storeOwned={storeOwned}
            taxStatus={taxStatus}
            gstNumber={gstNumber}
            qstNumber={qstNumber}
            province={province}
            hasChanges={hasChanges}
            isSubmitting={isSubmitting}
            onNameChange={setName}
            onEmailChange={setEmail}
            onFeeRateChange={setFeeRatePercent}
            onStoreOwnedChange={setStoreOwned}
            onTaxStatusChange={setTaxStatus}
            onGstNumberChange={setGstNumber}
            onQstNumberChange={setQstNumber}
            onProvinceChange={setProvince}
            onSave={handleSave}
          />

          <ConsignorListingsSummary
            consignorId={consignor.id}
            counts={counts}
          />
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
