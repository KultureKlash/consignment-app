import { useState } from "react";
import { Pencil, Camera } from "lucide-react";
import { processProductImage } from "~/lib/image-processing";
import { CATEGORIES, MAIN_CATEGORIES, parseCategory } from "~/lib/categories";
import type { ProductGroup, EditProductFields } from "./types";

export function EditProductModal({ group, onConfirm, onCancel }: {
  group: ProductGroup;
  onConfirm: (fields: EditProductFields) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(group.title);
  const [brand, setBrand] = useState(group.brand ?? "");
  const parsed = group.category ? parseCategory(group.category) : { main: "", sub: undefined };
  const [mainCat, setMainCat] = useState(parsed.main || "");
  const [subCat, setSubCat] = useState(parsed.sub || group.category || "");
  const subOptions = mainCat ? (CATEGORIES[mainCat] ?? []) : [];
  const [sku, setSku] = useState(group.sku ?? "");
  const [imageData, setImageData] = useState<string | undefined>();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await processProductImage(file);
    setImageData(data);
  };

  return (
    <div className="admin-modal-overlay p-4">
      <div className="admin-modal max-w-[480px] p-6">
        <div className="flex items-center gap-2 mb-1">
          <Pencil size={16} className="text-gray-500" />
          <h3 className="text-[15px] font-semibold m-0">Edit Product</h3>
        </div>
        <p className="text-[13px] text-gray-500 mt-0 mb-4">Changes apply to all listings of this product.</p>

        <div className="flex flex-col gap-3">
          {/* Image */}
          <div>
            <p className="admin-label text-[11px] uppercase tracking-wide font-bold">Product Image</p>
            <div className="flex items-center gap-3">
              {(imageData || group.imageUrl) && (
                <img src={imageData || group.imageUrl!} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
              )}
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-500 cursor-pointer hover:bg-gray-50">
                <Camera size={14} />
                {group.imageUrl ? "Replace" : "Upload"}
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
          </div>

          {/* Title */}
          <div>
            <p className="admin-label text-[11px] uppercase tracking-wide font-bold">Title</p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input" />
          </div>

          {/* Brand */}
          <div>
            <p className="admin-label text-[11px] uppercase tracking-wide font-bold">Brand</p>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className="admin-input" />
          </div>

          {/* Category */}
          <div className={`grid gap-3 ${subOptions.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
            <div>
              <p className="admin-label text-[11px] uppercase tracking-wide font-bold">Category</p>
              <select value={mainCat} onChange={(e) => { setMainCat(e.target.value); setSubCat(""); }} className="admin-input cursor-pointer appearance-auto">
                <option value="">Select...</option>
                {MAIN_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {subOptions.length > 0 && (
              <div>
                <p className="admin-label text-[11px] uppercase tracking-wide font-bold">Subcategory</p>
                <select value={subCat} onChange={(e) => setSubCat(e.target.value)} className="admin-input cursor-pointer appearance-auto">
                  <option value="">Select...</option>
                  {subOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* SKU */}
          <div>
            <p className="admin-label text-[11px] uppercase tracking-wide font-bold">SKU</p>
            <input value={sku} onChange={(e) => setSku(e.target.value)} className="admin-input" placeholder="Optional" />
          </div>
        </div>

        <div className="admin-modal-footer px-0 py-0 mt-5 border-0">
          <button onClick={onCancel} className="admin-btn-secondary text-[13px] px-4 py-2">
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ title: title.trim(), brand: brand.trim(), category: subCat || mainCat, sku: sku.trim(), imageData })}
            disabled={!title.trim()}
            className={`px-4 py-2 text-[13px] font-semibold rounded-lg border-0 text-white font-[inherit] ${
              !title.trim() ? "bg-gray-400 cursor-not-allowed" : "bg-gray-900 cursor-pointer hover:bg-gray-800"
            }`}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
