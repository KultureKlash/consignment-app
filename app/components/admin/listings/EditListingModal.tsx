import { useState } from "react";
import { Pencil } from "lucide-react";
import { fmt } from "~/lib/currency";
import type { Listing, EditApproveFields } from "./types";

export function EditListingModal({ listing, mode, onConfirm, onCancel, onUpdateCost }: {
  listing: Listing;
  mode: "edit-approve" | "edit" | "cost-only";
  onConfirm: (fields: EditApproveFields) => void;
  onCancel: () => void;
  onUpdateCost?: (listingId: string, cost: string) => void;
}) {
  const [size, setSize] = useState(listing.variant.size);
  const [gtin, setGtin] = useState(listing.variant.gtin ?? "");
  const [price, setPrice] = useState(String(fmt(Number(listing.price))));
  const [cost, setCost] = useState(listing.cost != null ? String(listing.cost) : "");
  const isCostOnly = mode === "cost-only";
  const isStoreOwned = listing.consignor.storeOwned ?? false;
  const [gtinUnlocked, setGtinUnlocked] = useState(false);

  const canSubmit = isCostOnly ? cost.trim() !== "" : (size.trim() && Number(price) > 0);

  return (
    <div className="admin-modal-overlay p-4">
      <div className="admin-modal max-w-[420px] p-6">
        <div className="flex items-center gap-2 mb-1">
          <Pencil size={16} className="text-gray-500" />
          <h3 className="text-[15px] font-semibold m-0">
            {isCostOnly ? "Edit Cost" : mode === "edit-approve" ? "Edit & Approve" : "Edit Listing"}
          </h3>
        </div>
        <p className="text-[13px] text-gray-500 mt-0 mb-4">
          {isCostOnly ? "Update the acquisition cost for this item." : mode === "edit-approve" ? "Fix variant details, then approve." : "Edit variant details."}
        </p>

        {/* Product info (read-only) */}
        <div className="px-3 py-2.5 rounded-lg bg-gray-50 mb-4 text-xs">
          <div className="font-semibold text-gray-900">{listing.variant.product.title}</div>
          <div className="text-gray-500 mt-0.5">
            {listing.consignor.name}
            {listing.consignor.storeOwned && <span className="ml-1.5 px-1.5 py-px rounded bg-blue-100 text-blue-800 font-semibold text-[10px]">Store</span>}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {!isCostOnly && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="admin-label text-[11px] uppercase tracking-wide">Size</label>
                <input
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  disabled={!isStoreOwned}
                  className={`admin-input ${!isStoreOwned ? "opacity-60 cursor-not-allowed" : ""}`}
                />
              </div>
              <div>
                <label className="admin-label text-[11px] uppercase tracking-wide">GTIN / Barcode</label>
                <input
                  value={gtin}
                  onChange={(e) => setGtin(e.target.value)}
                  readOnly={!!listing.variant.gtin && mode !== "edit-approve" && !gtinUnlocked}
                  onDoubleClick={() => { if (!!listing.variant.gtin && mode !== "edit-approve") setGtinUnlocked(true); }}
                  className={`admin-input font-mono ${!!listing.variant.gtin && mode !== "edit-approve" && !gtinUnlocked ? "opacity-60 cursor-default" : ""}`}
                  title={!!listing.variant.gtin && mode !== "edit-approve" && !gtinUnlocked ? "Double-click to edit" : undefined}
                  placeholder="Optional"
                />
              </div>
            </div>
          )}

          <div className={`grid gap-3 ${isCostOnly || !isStoreOwned ? "grid-cols-1" : "grid-cols-2"}`}>
            {!isCostOnly && (
              <div>
                <label className="admin-label text-[11px] uppercase tracking-wide">Price ($)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={!isStoreOwned}
                  className={`admin-input ${!isStoreOwned ? "opacity-60 cursor-not-allowed" : ""}`}
                />
              </div>
            )}
            {(isCostOnly || isStoreOwned) && (
              <div>
                <label className="admin-label text-[11px] uppercase tracking-wide">Cost ($)</label>
                <input type="text" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className="admin-input" placeholder="0.00" />
              </div>
            )}
          </div>
        </div>

        <div className="admin-modal-footer px-0 py-0 mt-4 border-0">
          <button onClick={onCancel} className="admin-btn-secondary text-[13px] px-4 py-2">
            Cancel
          </button>
          <button
            onClick={() => {
              if (isCostOnly && onUpdateCost) {
                onUpdateCost(listing.id, cost.trim());
              } else {
                onConfirm({
                  size: size.trim(), gtin: gtin.trim(), price,
                  ...(cost.trim() ? { cost: cost.trim() } : {}),
                });
              }
            }}
            disabled={!canSubmit}
            className={`px-4 py-2 text-[13px] font-semibold rounded-lg border-0 text-white font-[inherit] transition-colors duration-150 ${
              !canSubmit ? "bg-gray-300 cursor-not-allowed" : "bg-gray-900 cursor-pointer hover:bg-gray-800"
            }`}
          >
            {mode === "edit-approve" ? "Save & Approve" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
