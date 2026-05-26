import { useMemo, useState } from "react";
import { CATEGORIES, MAIN_CATEGORIES, buildCategory } from "~/lib/categories";

/** Bulk-edit modal for the admin Listings page.
 *
 *  - Brand / Category are PRODUCT-level: any product owning a selected
 *    listing gets updated (which affects all of that product's other
 *    listings too, even ones not selected — admin should know).
 *  - Cost / Price are PER-LISTING and store-owned only: hidden unless
 *    every selected listing belongs to a store-owned consignor. Real
 *    consignors set their own prices; their cost is internal to them.
 *  - Empty fields = leave that field unchanged (not "clear it"). */
export function BulkEditModal({
  count,
  financialsEditable,
  isSubmitting,
  onConfirm,
  onCancel,
}: {
  count: number;
  /** True only when every selected listing belongs to a storeOwned consignor.
   *  Gates the Cost + Price fields. */
  financialsEditable: boolean;
  isSubmitting?: boolean;
  onConfirm: (fields: { brand?: string; category?: string; cost?: string; price?: string }) => void;
  onCancel: () => void;
}) {
  const [brand, setBrand] = useState("");
  const [mainCat, setMainCat] = useState("");
  const [subCat, setSubCat] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");

  const subOptions = useMemo(() => (mainCat ? (CATEGORIES[mainCat] ?? []) : []), [mainCat]);

  const hasAnyChange = !!(brand.trim() || mainCat || cost.trim() || price.trim());

  const handleApply = () => {
    if (!hasAnyChange || isSubmitting) return;
    const category = mainCat ? buildCategory(mainCat, subCat || undefined) : "";
    onConfirm({
      ...(brand.trim() ? { brand: brand.trim() } : {}),
      ...(category ? { category } : {}),
      ...(financialsEditable && cost.trim() ? { cost: cost.trim() } : {}),
      ...(financialsEditable && price.trim() ? { price: price.trim() } : {}),
    });
  };

  return (
    <div onClick={onCancel} className="admin-modal-overlay p-4">
      <div onClick={(e) => e.stopPropagation()} className="admin-modal max-w-[460px] p-6">
        <h3 className="text-[15px] font-semibold mt-0 mb-1">Bulk edit {count} listing{count === 1 ? "" : "s"}</h3>
        <p className="text-[13px] text-gray-500 mt-0 mb-4">
          Leave any field blank to keep it unchanged. Brand &amp; Category apply to the whole product.
          {financialsEditable && " Cost &amp; Price are per-listing."}
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <p className="admin-label text-[11px] uppercase tracking-wide font-bold">Brand</p>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="admin-input"
              placeholder="Leave blank to keep current"
            />
          </div>

          <div className={`grid gap-3 ${subOptions.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
            <div>
              <p className="admin-label text-[11px] uppercase tracking-wide font-bold">Category</p>
              <select
                value={mainCat}
                onChange={(e) => { setMainCat(e.target.value); setSubCat(""); }}
                className="admin-input cursor-pointer appearance-auto"
              >
                <option value="">(keep current)</option>
                {MAIN_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {subOptions.length > 0 && (
              <div>
                <p className="admin-label text-[11px] uppercase tracking-wide font-bold">Subcategory</p>
                <select
                  value={subCat}
                  onChange={(e) => setSubCat(e.target.value)}
                  className="admin-input cursor-pointer appearance-auto"
                >
                  <option value="">(none)</option>
                  {subOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          {financialsEditable && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="admin-label text-[11px] uppercase tracking-wide font-bold">Cost</p>
                <input
                  type="text"
                  inputMode="decimal"
                  value={cost}
                  onChange={(e) => setCost(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="admin-input"
                  placeholder="$"
                />
              </div>
              <div>
                <p className="admin-label text-[11px] uppercase tracking-wide font-bold">Price</p>
                <input
                  type="text"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="admin-input"
                  placeholder="$"
                />
              </div>
            </div>
          )}

          {!financialsEditable && (
            <p className="text-[11px] text-gray-400 mt-1">
              Cost &amp; Price aren't bulk-editable — selection includes real consignor listings. Use individual edit to change those.
            </p>
          )}
        </div>

        <div className="admin-modal-footer px-0 py-0 mt-5 border-0">
          <button onClick={onCancel} className="admin-btn-secondary text-[13px] px-4 py-2">
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!hasAnyChange || isSubmitting}
            className={`px-4 py-2 text-[13px] font-semibold rounded-lg border-0 text-white font-[inherit] transition-colors duration-150 ${
              !hasAnyChange || isSubmitting ? "bg-gray-300 cursor-not-allowed" : "bg-gray-900 cursor-pointer hover:bg-gray-800"
            }`}
          >
            {isSubmitting ? "Applying..." : `Apply to ${count}`}
          </button>
        </div>
      </div>
    </div>
  );
}
