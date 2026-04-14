import { useState } from "react";
import { Pencil } from "lucide-react";
import { fmt } from "~/lib/currency";
import type { Listing, EditApproveFields } from "./types";

export function EditListingModal({ listing, mode, onConfirm, onCancel }: {
  listing: Listing;
  mode: "edit-approve" | "edit";
  onConfirm: (fields: EditApproveFields) => void;
  onCancel: () => void;
}) {
  const [size, setSize] = useState(listing.variant.size);
  const [gtin, setGtin] = useState(listing.variant.gtin ?? "");
  const [price, setPrice] = useState(String(fmt(Number(listing.price))));
  const [cost, setCost] = useState(listing.cost != null ? String(listing.cost) : "");
  const isStoreOwned = listing.consignor.storeOwned ?? false;

  const canSubmit = size.trim() && Number(price) > 0;

  return (
    <div className="admin-modal-overlay p-4">
      <div className="admin-modal max-w-[420px] p-6">
        <div className="flex items-center gap-2 mb-1">
          <Pencil size={16} className="text-purple-600" />
          <h3 className="text-[15px] font-semibold m-0">
            {mode === "edit-approve" ? "Edit & Approve" : "Edit Listing"}
          </h3>
        </div>
        <p className="text-[13px] text-gray-500 mt-0 mb-4">
          {mode === "edit-approve" ? "Fix variant details, then approve." : "Edit variant details."}
        </p>

        {/* Product info (read-only) */}
        <div className="px-3 py-2.5 rounded-lg bg-gray-50 mb-4 text-xs">
          <div className="font-semibold text-gray-900">{listing.variant.product.title}</div>
          <div className="text-gray-500 mt-0.5">
            {listing.consignor.name}
            {isStoreOwned && <span className="ml-1.5 px-1.5 py-px rounded bg-blue-100 text-blue-800 font-semibold text-[10px]">Store</span>}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="admin-label text-[11px] uppercase tracking-wide">Size</label>
              <input value={size} onChange={(e) => setSize(e.target.value)} className="admin-input" />
            </div>
            <div>
              <label className="admin-label text-[11px] uppercase tracking-wide">GTIN / Barcode</label>
              <input value={gtin} onChange={(e) => setGtin(e.target.value)} className="admin-input font-mono" placeholder="Optional" />
            </div>
          </div>

          <div className={`grid gap-3 ${isStoreOwned ? "grid-cols-2" : "grid-cols-1"}`}>
            <div>
              <label className="admin-label text-[11px] uppercase tracking-wide">Price ($)</label>
              <input type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="admin-input" />
            </div>
            {isStoreOwned && (
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
            onClick={() => onConfirm({
              size: size.trim(), gtin: gtin.trim(), price,
              ...(isStoreOwned ? { cost: cost.trim() } : {}),
            })}
            disabled={!canSubmit}
            className={`px-4 py-2 text-[13px] font-semibold rounded-lg border-0 text-white font-[inherit] transition-colors duration-150 ${
              !canSubmit ? "bg-purple-300 cursor-not-allowed" : "bg-purple-600 cursor-pointer hover:bg-purple-700"
            }`}
          >
            {mode === "edit-approve" ? "Save & Approve" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
