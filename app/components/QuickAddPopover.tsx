import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import CustomSelect from "./CustomSelect";
import { inputStyle, labelStyle, handleFocus, handleBlurStyle } from "~/lib/listing-ui";

type Consignor = { id: string; name: string };

type VariantInfo = {
  size: string;
  gtin: string | null;
};

type QuickAddData = {
  productId: string;
  title: string;
  brand: string | null;
  styleId: string | null;
  category: string | null;
  variants: VariantInfo[];
};

type Props = {
  anchorEl: HTMLElement;
  data: QuickAddData;
  consignors: Consignor[];
  onSubmit: (fields: Record<string, string>) => void;
  onClose: () => void;
  isSubmitting?: boolean;
};

const popoverStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 9999,
  background: "white",
  border: "1px solid #e2e5ea",
  borderRadius: "10px",
  boxShadow: "0 4px 20px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.04)",
  padding: "16px",
  width: "320px",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const compactInput: React.CSSProperties = {
  ...inputStyle,
  padding: "8px 12px",
  fontSize: "13px",
};

const addBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: "13px",
  fontWeight: 600,
  borderRadius: "10px",
  border: "none",
  background: "#111827",
  color: "#fff",
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all 0.2s ease",
};

export default function QuickAddPopover({
  anchorEl,
  data,
  consignors,
  onSubmit,
  onClose,
  isSubmitting,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  const [consignorId, setConsignorId] = useState("");
  const [size, setSize] = useState("");
  const [isNewSize, setIsNewSize] = useState(false);
  const [newSize, setNewSize] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [gtin, setGtin] = useState("");
  const [gtinLocked, setGtinLocked] = useState(false);

  const isFootwear = !data.category || data.category.startsWith("Footwear");
  const effectiveSize = isNewSize ? newSize : size;

  // Determine if GTIN field should show
  const existingVariant = data.variants.find((v) => v.size === size);
  const needsGtin = isFootwear && (isNewSize || (existingVariant && !existingVariant.gtin));

  // Position popover
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const popoverWidth = 320;
      let left = rect.right - popoverWidth;
      if (left < 8) left = 8;
      setPos({ top: rect.bottom + 6, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [mounted, anchorEl]);

  // Click-outside to close (ignore clicks inside portal dropdowns)
  useEffect(() => {
    if (!mounted) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (popoverRef.current && !popoverRef.current.contains(target) && !anchorEl.contains(target)) {
        // CustomSelect dropdowns render via portal — don't close if click is inside one
        if (target.closest?.("[data-portal-dropdown]")) return;
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mounted, anchorEl, onClose]);

  // Auto-fill GTIN when selecting existing variant
  useEffect(() => {
    if (isNewSize) {
      setGtin("");
      setGtinLocked(false);
      return;
    }
    if (!size) {
      setGtin("");
      setGtinLocked(false);
      return;
    }
    const variant = data.variants.find((v) => v.size === size);
    if (variant?.gtin) {
      setGtin(variant.gtin);
      setGtinLocked(true);
    } else {
      setGtin("");
      setGtinLocked(false);
    }
  }, [size, isNewSize, data.variants]);

  const sizeOptions = data.variants.map((v) => ({ label: v.size, value: v.size }));

  const consignorOptions = consignors.map((c) => ({ label: c.name, value: c.id }));

  const canSubmit =
    consignorId &&
    effectiveSize &&
    price &&
    Number(price) > 0 &&
    Number(quantity) >= 1 &&
    (!needsGtin || gtin) &&
    !isSubmitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      intent: "quick-add",
      consignorId,
      title: data.title,
      brand: data.brand ?? "",
      category: data.category ?? "",
      styleId: data.styleId ?? "",
      size: effectiveSize,
      gtin: gtin || "",
      price,
      quantity,
    });
  };

  if (!mounted) return null;

  return createPortal(
    <div ref={popoverRef} style={{ ...popoverStyle, top: pos.top, left: pos.left }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>
          Quick add
        </div>
        <span
          onClick={onClose}
          style={{ fontSize: "18px", color: "#9ca3af", cursor: "pointer", lineHeight: 1, fontWeight: 500 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#1a1a1a"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#9ca3af"; }}
        >
          ×
        </span>
      </div>

      {/* Product name */}
      <div style={{ fontSize: "12px", color: "#6d7175", marginBottom: "12px", lineHeight: 1.4 }}>
        {data.title}
        {data.brand ? ` · ${data.brand}` : ""}
      </div>

      {/* Consignor */}
      <div style={{ marginBottom: "10px" }}>
        <label style={labelStyle}>Consignor</label>
        <CustomSelect
          options={consignorOptions}
          value={consignorId}
          onChange={setConsignorId}
          placeholder="Select consignor..."
          searchable
        />
      </div>

      {/* Size */}
      <div style={{ marginBottom: "10px" }}>
        <label style={labelStyle}>Size</label>
        {isNewSize ? (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlurStyle}
              placeholder="Enter size..."
              style={{ ...compactInput, flex: 1 }}
              autoFocus
            />
            <span
              onClick={() => { setIsNewSize(false); setNewSize(""); }}
              style={{ fontSize: "12px", color: "#6d7175", cursor: "pointer", whiteSpace: "nowrap", fontWeight: 500 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#1a1a1a"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#6d7175"; }}
            >
              Back
            </span>
          </div>
        ) : (
          <CustomSelect
            options={sizeOptions}
            value={size}
            onChange={setSize}
            placeholder="Select size..."
            searchable
            actionItem={{
              label: "+ New size",
              onSelect: () => setIsNewSize(true),
            }}
          />
        )}
      </div>

      {/* GTIN — conditional */}
      {needsGtin && (
        <div style={{ marginBottom: "10px" }}>
          <label style={labelStyle}>GTIN / Barcode</label>
          <input
            type="text"
            value={gtin}
            onChange={(e) => setGtin(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlurStyle}
            placeholder="Scan or enter barcode..."
            style={gtinLocked ? { ...compactInput, background: "#f9fafb", color: "#6b7280" } : compactInput}
            disabled={gtinLocked}
          />
        </div>
      )}

      {/* Price + Quantity row */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Price ($)</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlurStyle}
            placeholder="0.00"
            min="0"
            step="0.01"
            style={compactInput}
          />
        </div>
        <div style={{ flex: "0 0 80px" }}>
          <label style={labelStyle}>Qty</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlurStyle}
            min="1"
            max="50"
            style={compactInput}
          />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "12px" }}>
        <span
          onClick={onClose}
          style={{ fontSize: "13px", color: "#6d7175", cursor: "pointer", fontWeight: 500 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#1a1a1a"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#6d7175"; }}
        >
          Cancel
        </span>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            ...addBtnStyle,
            ...(canSubmit
              ? {}
              : { background: "#d1d5db", cursor: "not-allowed" }),
          }}
          onMouseEnter={(e) => { if (canSubmit) { e.currentTarget.style.background = "#374151"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
          onMouseLeave={(e) => { if (canSubmit) { e.currentTarget.style.background = "#111827"; e.currentTarget.style.transform = "none"; } }}
        >
          {isSubmitting ? "Adding..." : "Add"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
