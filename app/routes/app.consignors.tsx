import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getConsignorBalance } from "~/services/orders.server";
import { createConsignor } from "~/services/consignors.server";
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

      await createConsignor({
        name: data.name,
        email: data.email,
        feeRate: data.feeRate / 100,
        taxStatus: data.taxStatus,
        gstNumber: data.gstNumber,
        qstNumber: data.qstNumber,
        province: data.province,
      });
      return { success: true, intent };
    }
    throw new Error("Invalid intent");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message, intent };
  }
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
  const [newTaxStatus, setNewTaxStatus] = useState("individual");
  const [newGstNumber, setNewGstNumber] = useState("");
  const [newQstNumber, setNewQstNumber] = useState("");
  const [newProvince, setNewProvince] = useState("QC");

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
      setNewTaxStatus("individual");
      setNewGstNumber("");
      setNewQstNumber("");
      setNewProvince("QC");
    }
  }, [fetcher.data, shopify]);

  const handleCreate = () => {
    fetcher.submit(
      {
        intent: "create",
        name,
        email,
        feeRate,
        taxStatus: newTaxStatus,
        gstNumber: newTaxStatus === "business" ? newGstNumber : "",
        qstNumber: newTaxStatus === "business" ? newQstNumber : "",
        province: newTaxStatus === "business" ? newProvince : "",
      },
      { method: "POST" },
    );
  };

  const canSubmit = name.trim() && email.trim() && !isNaN(parseFloat(feeRate));

  return (
    <s-page heading="Consignors">
      <s-section>
        <div className="flex justify-between items-center mb-3">
          <span className="text-[13px] text-gray-500">
            {consignors.length} consignor{consignors.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setShowModal(true)}
            className="admin-btn-primary inline-flex items-center gap-1.5 !px-4 !py-2 !text-[13px]"
          >
            <Plus size={14} />
            Add Consignor
          </button>
        </div>

        {consignors.length === 0 ? (
          <s-paragraph>No consignors yet. Add one to get started.</s-paragraph>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b-2 border-gray-300 text-left">
                <th className="admin-th">Name</th>
                <th className="admin-th">Email</th>
                <th className="admin-th">Fee Rate</th>
                <th className="admin-th">Balance</th>
                <th className="admin-th w-8" />
              </tr>
            </thead>
            <tbody>
              {consignors.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/app/consignors/${c.id}`)}
                  className="border-b border-gray-200 cursor-pointer transition-colors duration-150 hover:bg-gray-50"
                >
                  <td className="admin-td font-medium">
                    {c.name}
                    {c.storeOwned && (
                      <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-full uppercase tracking-wide">
                        Store
                      </span>
                    )}
                    {c.status === "suspended" && (
                      <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full uppercase tracking-wide">
                        Suspended
                      </span>
                    )}
                  </td>
                  <td className="admin-td">{c.email}</td>
                  <td className="admin-td">{(c.feeRate * 100).toFixed(0)}%</td>
                  <td
                    className="admin-td font-bold"
                    style={{ color: (balances[c.id] ?? 0) > 0 ? "#1a7f37" : "#333" }}
                  >
                    ${fmt(balances[c.id] ?? 0)}
                  </td>
                  <td className="admin-td text-gray-400">
                    <ChevronRight size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>

      {showModal && (
        <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="admin-modal !max-w-[440px]" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="m-0 text-[15px] font-semibold text-gray-900">Add Consignor</h2>
              <button
                onClick={() => setShowModal(false)}
                className="bg-transparent border-0 cursor-pointer p-1 text-gray-500"
              >
                <X size={18} />
              </button>
            </div>
            <div className="admin-modal-body flex flex-col gap-4">
              <div>
                <label className="admin-label">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="admin-input"
                  placeholder="Full name"
                  autoFocus
                />
              </div>
              <div>
                <label className="admin-label">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="admin-input"
                  placeholder="email@example.com"
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
                    value={feeRate}
                    onChange={(e) => setFeeRate(e.target.value)}
                    className="admin-input pr-8"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">%</span>
                </div>
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Platform fee deducted from sales. Consignor keeps {100 - (parseFloat(feeRate) || 0)}%.
                </span>
              </div>

              {/* Tax Status */}
              <div>
                <label className="admin-label">Tax Status</label>
                <div className="flex gap-2">
                  {(["individual", "business"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setNewTaxStatus(status)}
                      className={`flex-1 py-2 px-3 text-[13px] font-medium rounded-lg border cursor-pointer transition-all duration-150 ${
                        newTaxStatus === status
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-300 bg-white text-gray-700"
                      }`}
                    >
                      {status === "individual" ? "Individual" : "Registered Business"}
                    </button>
                  ))}
                </div>
              </div>

              {newTaxStatus === "business" && (
                <>
                  <div>
                    <label className="admin-label">Province</label>
                    <select
                      value={newProvince}
                      onChange={(e) => setNewProvince(e.target.value)}
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
                      value={newGstNumber}
                      onChange={(e) => setNewGstNumber(e.target.value)}
                      className="admin-input"
                      placeholder="e.g. 123456789 RT0001"
                    />
                  </div>
                  {newProvince === "QC" && (
                    <div>
                      <label className="admin-label">QST Number</label>
                      <input
                        type="text"
                        value={newQstNumber}
                        onChange={(e) => setNewQstNumber(e.target.value)}
                        className="admin-input"
                        placeholder="e.g. 1234567890 TQ0001"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="admin-modal-footer">
              <button
                onClick={() => setShowModal(false)}
                className="admin-btn-secondary !px-4 !py-2 !text-[13px]"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!canSubmit || isSubmitting}
                className={`admin-btn-primary !px-5 !py-2 !text-[13px] ${
                  !canSubmit ? "!bg-gray-400 !cursor-default hover:!bg-gray-400 hover:!shadow-none hover:!translate-y-0" : ""
                } ${isSubmitting ? "opacity-70" : ""}`}
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
