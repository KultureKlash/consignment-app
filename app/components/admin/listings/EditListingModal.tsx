import { useState } from "react";
import { Pencil } from "lucide-react";
import { fmt } from "~/lib/currency";
import type { Listing, EditApproveFields } from "./types";
import { editInputStyle, editLabelStyle } from "./helpers";

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

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#7c3aed";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.1)";
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#d1d5db";
    e.currentTarget.style.boxShadow = "none";
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "420px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <Pencil size={16} color="#7c3aed" />
          <h3 style={{ fontSize: "15px", fontWeight: 600, margin: 0 }}>
            {mode === "edit-approve" ? "Edit & Approve" : "Edit Listing"}
          </h3>
        </div>
        <p style={{ fontSize: "13px", color: "#6d7175", margin: "0 0 16px" }}>
          {mode === "edit-approve" ? "Fix variant details, then approve." : "Edit variant details."}
        </p>

        {/* Product info (read-only) */}
        <div style={{ padding: "10px 12px", borderRadius: "8px", background: "#f9fafb", marginBottom: "16px", fontSize: "12px" }}>
          <div style={{ fontWeight: 600, color: "#1a1a1a" }}>{listing.variant.product.title}</div>
          <div style={{ color: "#6d7175", marginTop: "2px" }}>
            {listing.consignor.name}
            {isStoreOwned && <span style={{ marginLeft: "6px", padding: "1px 6px", borderRadius: "4px", background: "#dbeafe", color: "#1e40af", fontWeight: 600, fontSize: "10px" }}>Store</span>}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={editLabelStyle}>Size</label>
              <input value={size} onChange={(e) => setSize(e.target.value)} style={editInputStyle} onFocus={handleFocus} onBlur={handleBlur} />
            </div>
            <div>
              <label style={editLabelStyle}>GTIN / Barcode</label>
              <input value={gtin} onChange={(e) => setGtin(e.target.value)} style={{ ...editInputStyle, fontFamily: "monospace" }} onFocus={handleFocus} onBlur={handleBlur} placeholder="Optional" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isStoreOwned ? "1fr 1fr" : "1fr", gap: "12px" }}>
            <div>
              <label style={editLabelStyle}>Price ($)</label>
              <input type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} style={editInputStyle} onFocus={handleFocus} onBlur={handleBlur} />
            </div>
            {isStoreOwned && (
              <div>
                <label style={editLabelStyle}>Cost ($)</label>
                <input type="text" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} style={editInputStyle} onFocus={handleFocus} onBlur={handleBlur} placeholder="0.00" />
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
          <button onClick={onCancel} style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 500, borderRadius: "8px", border: "1px solid #e3e3e3", background: "#fff", color: "#6d7175", cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm({
              size: size.trim(), gtin: gtin.trim(), price,
              ...(isStoreOwned ? { cost: cost.trim() } : {}),
            })}
            disabled={!canSubmit}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "8px",
              border: "none",
              background: !canSubmit ? "#c4b5fd" : "#7c3aed",
              color: "#fff",
              cursor: !canSubmit ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { if (canSubmit) e.currentTarget.style.background = "#6d28d9"; }}
            onMouseLeave={(e) => { if (canSubmit) e.currentTarget.style.background = "#7c3aed"; }}
          >
            {mode === "edit-approve" ? "Save & Approve" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
