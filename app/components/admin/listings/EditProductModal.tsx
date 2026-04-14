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
  const [styleId, setStyleId] = useState(group.styleId ?? "");
  const [imageData, setImageData] = useState<string | undefined>();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await processProductImage(file);
    setImageData(data);
  };

  const fieldLabel: React.CSSProperties = { fontSize: "11px", fontWeight: 700, color: "#6d7175", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" };
  const fieldInput: React.CSSProperties = { width: "100%", padding: "9px 12px", fontSize: "13px", border: "1px solid #e3e3e3", borderRadius: "8px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "480px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <Pencil size={16} color="#6d7175" />
          <h3 style={{ fontSize: "15px", fontWeight: 600, margin: 0 }}>Edit Product</h3>
        </div>
        <p style={{ fontSize: "13px", color: "#6d7175", margin: "0 0 16px" }}>Changes apply to all listings of this product.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Image */}
          <div>
            <p style={fieldLabel}>Product Image</p>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {(imageData || group.imageUrl) && (
                <img src={imageData || group.imageUrl!} alt="" style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e3e3e3" }} />
              )}
              <label style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "8px", border: "1px solid #d1d5db", background: "#fff", fontSize: "12px", fontWeight: 500, color: "#6d7175", cursor: "pointer" }}>
                <Camera size={14} />
                {group.imageUrl ? "Replace" : "Upload"}
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
              </label>
            </div>
          </div>

          {/* Title */}
          <div>
            <p style={fieldLabel}>Title</p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={fieldInput} />
          </div>

          {/* Brand */}
          <div>
            <p style={fieldLabel}>Brand</p>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} style={fieldInput} />
          </div>

          {/* Category */}
          <div style={{ display: "grid", gridTemplateColumns: subOptions.length > 0 ? "1fr 1fr" : "1fr", gap: "12px" }}>
            <div>
              <p style={fieldLabel}>Category</p>
              <select value={mainCat} onChange={(e) => { setMainCat(e.target.value); setSubCat(""); }} style={{ ...fieldInput, cursor: "pointer", appearance: "auto" }}>
                <option value="">Select...</option>
                {MAIN_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {subOptions.length > 0 && (
              <div>
                <p style={fieldLabel}>Subcategory</p>
                <select value={subCat} onChange={(e) => setSubCat(e.target.value)} style={{ ...fieldInput, cursor: "pointer", appearance: "auto" }}>
                  <option value="">Select...</option>
                  {subOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Style ID */}
          <div>
            <p style={fieldLabel}>Style ID</p>
            <input value={styleId} onChange={(e) => setStyleId(e.target.value)} style={fieldInput} placeholder="Optional" />
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px" }}>
          <button onClick={onCancel} style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 500, borderRadius: "8px", border: "1px solid #e3e3e3", background: "#fff", color: "#6d7175", cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ title: title.trim(), brand: brand.trim(), category: subCat || mainCat, styleId: styleId.trim(), imageData })}
            disabled={!title.trim()}
            style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", border: "none", background: !title.trim() ? "#9ca3af" : "#111827", color: "#fff", cursor: !title.trim() ? "not-allowed" : "pointer", fontFamily: "inherit" }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
