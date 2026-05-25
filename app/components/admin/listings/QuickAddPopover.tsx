import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../shared/CustomSelect";

type Consignor = { id: string; name: string };

type VariantInfo = {
  size: string;
  gtin: string | null;
};

type QuickAddData = {
  productId: string;
  title: string;
  brand: string | null;
  sku: string | null;
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
      const popoverHeight = 380; // approximate max height
      let left = rect.right - popoverWidth;
      if (left < 8) left = 8;
      // If not enough space below, position above the button
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < popoverHeight
        ? rect.top - popoverHeight - 6
        : rect.bottom + 6;
      setPos({ top, left });
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
      sku: data.sku ?? "",
      size: effectiveSize,
      gtin: gtin || "",
      price,
      quantity,
      // Quick-add is "add to this exact product" — skip dedup detection.
      useExistingProductId: data.productId,
    });
  };

  if (!mounted) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-80 font-[Inter,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]"
      style={{ top: pos.top, left: pos.left }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="text-[13px] font-semibold text-gray-900">
          Quick add
        </div>
        <span
          onClick={onClose}
          className="text-lg text-gray-400 cursor-pointer leading-none font-medium hover:text-gray-900"
        >
          ×
        </span>
      </div>

      {/* Product name */}
      <div className="text-xs text-gray-500 mb-3 leading-relaxed">
        {data.title}
        {data.brand ? ` · ${data.brand}` : ""}
      </div>

      {/* Consignor */}
      <div className="mb-2.5">
        <label className="admin-label">Consignor</label>
        <CustomSelect
          options={consignorOptions}
          value={consignorId}
          onChange={setConsignorId}
          placeholder="Select consignor..."
          searchable
        />
      </div>

      {/* Size */}
      <div className="mb-2.5">
        <label className="admin-label">Size</label>
        {isNewSize ? (
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              placeholder="Enter size..."
              className="admin-input py-2 px-3 text-[13px] flex-1"
              autoFocus
            />
            <span
              onClick={() => { setIsNewSize(false); setNewSize(""); }}
              className="text-xs text-gray-500 cursor-pointer whitespace-nowrap font-medium hover:text-gray-900"
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
        <div className="mb-2.5">
          <label className="admin-label">GTIN / Barcode</label>
          <input
            type="text"
            value={gtin}
            onChange={(e) => setGtin(e.target.value)}
            placeholder="Scan or enter barcode..."
            className={gtinLocked ? "admin-input-disabled py-2 px-3 text-[13px]" : "admin-input py-2 px-3 text-[13px]"}
            disabled={gtinLocked}
          />
        </div>
      )}

      {/* Price + Quantity row */}
      <div className="flex gap-2.5 mb-3.5">
        <div className="flex-1">
          <label className="admin-label">Price ($)</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            className="admin-input py-2 px-3 text-[13px]"
          />
        </div>
        <div className="flex-none w-20">
          <label className="admin-label">Qty</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min="1"
            max="50"
            className="admin-input py-2 px-3 text-[13px]"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <span
          onClick={onClose}
          className="text-[13px] text-gray-500 cursor-pointer font-medium hover:text-gray-900"
        >
          Cancel
        </span>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="admin-btn-primary px-4 py-2 text-[13px] disabled:bg-gray-300 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0"
        >
          {isSubmitting ? "Adding..." : "Add"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
