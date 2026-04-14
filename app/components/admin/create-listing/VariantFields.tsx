import { Barcode } from "lucide-react";
import {
  inputStyle,
  disabledInput,
  handleFocus,
  handleBlurStyle,
} from "~/lib/admin/listing-ui";
import CustomSelect from "~/components/admin/CustomSelect";
import { fieldLabel, helperText } from "./helpers";
import { useCreateListing } from "./CreateListingContext";

export default function VariantFields() {
  const {
    isFootwearCat,
    formFields,
    setFormFields,
    fieldErrors,
    clearError,
    selectedProduct,
    selectedProductId,
    newProductMode,
    newSizeMode,
    setNewSizeMode,
    gtinLocked,
    setGtinLocked,
    selectedConsignorObj,
  } = useCreateListing();

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          marginBottom: "16px",
        }}
      >
        <div>
          <label style={fieldLabel}>Size</label>
          {selectedProduct && !newSizeMode ? (
            <CustomSelect
              options={selectedProduct.variants.map((v) => v.size)}
              value={formFields.size}
              onChange={(val) => {
                const existingVariant = selectedProduct.variants.find(
                  (v) => v.size === val,
                );
                const variantGtin = existingVariant?.gtin ?? "";
                setFormFields({ ...formFields, size: val, gtin: variantGtin });
                setGtinLocked(variantGtin.length > 0);
                clearError("size");
              }}
              placeholder="Select size..."
              hasError={fieldErrors.has("size")}
              actionItem={{
                label: "+ New size",
                onSelect: () => {
                  setNewSizeMode(true);
                  setFormFields({ ...formFields, size: "", gtin: "" });
                  setGtinLocked(false);
                },
              }}
            />
          ) : isFootwearCat ? (
            <input
              type="number"
              value={formFields.size}
              onChange={(e) => {
                setFormFields({ ...formFields, size: e.target.value });
                clearError("size");
              }}
              onFocus={handleFocus}
              onBlur={handleBlurStyle}
              placeholder="e.g. 10"
              min="1"
              max="99"
              step="0.5"
              style={{
                ...inputStyle,
                ...(fieldErrors.has("size") ? { borderColor: "#ef4444" } : {}),
              }}
            />
          ) : (
            <input
              type="text"
              value={formFields.size}
              onChange={(e) => {
                setFormFields({ ...formFields, size: e.target.value });
                clearError("size");
              }}
              onFocus={handleFocus}
              onBlur={handleBlurStyle}
              placeholder="e.g. M, L, XL"
              style={{
                ...inputStyle,
                ...(fieldErrors.has("size") ? { borderColor: "#ef4444" } : {}),
              }}
            />
          )}
        </div>
        <div>
          <label style={fieldLabel}>Quantity</label>
          <input
            type="number"
            value={formFields.quantity}
            onChange={(e) => setFormFields({ ...formFields, quantity: e.target.value })}
            onFocus={handleFocus}
            onBlur={handleBlurStyle}
            min="1"
            max="50"
            step="1"
            style={inputStyle}
          />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isFootwearCat ? "1fr 1fr" : "1fr",
          gap: "16px",
        }}
      >
        <div>
          <label style={fieldLabel}>Price</label>
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#6d7175",
                fontSize: "14px",
                fontWeight: 500,
                pointerEvents: "none",
              }}
            >
              $
            </span>
            <input
              type="number"
              value={formFields.price}
              onChange={(e) => {
                setFormFields({ ...formFields, price: e.target.value });
                clearError("price");
              }}
              onFocus={handleFocus}
              onBlur={handleBlurStyle}
              placeholder="0.00"
              min="1"
              step="1"
              style={{
                ...inputStyle,
                paddingLeft: "30px",
                ...(fieldErrors.has("price") ? { borderColor: "#ef4444" } : {}),
              }}
            />
          </div>
        </div>
        {selectedConsignorObj?.storeOwned && (
          <div>
            <label style={fieldLabel}>
              Cost <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
            </label>
            <div style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: "14px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#6d7175",
                  fontSize: "14px",
                  fontWeight: 500,
                  pointerEvents: "none",
                }}
              >
                $
              </span>
              <input
                type="number"
                value={formFields.cost}
                onChange={(e) => setFormFields({ ...formFields, cost: e.target.value })}
                onFocus={handleFocus}
                onBlur={handleBlurStyle}
                placeholder="0.00"
                min="0"
                step="1"
                style={{ ...inputStyle, paddingLeft: "30px" }}
              />
            </div>
            <p style={helperText}>Acquisition cost for profit tracking</p>
          </div>
        )}
        {isFootwearCat && (
          <div>
            <label style={fieldLabel}>GTIN / Barcode</label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={formFields.gtin}
                onChange={(e) => {
                  setFormFields({ ...formFields, gtin: e.target.value });
                  clearError("gtin");
                }}
                onFocus={handleFocus}
                onBlur={handleBlurStyle}
                placeholder="Scan or enter GTIN"
                disabled={gtinLocked}
                style={{
                  ...(gtinLocked ? disabledInput : inputStyle),
                  paddingRight: "36px",
                  ...(fieldErrors.has("gtin") ? { borderColor: "#ef4444" } : {}),
                }}
              />
              <span
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  color: gtinLocked ? "#d1d5db" : "#059669",
                }}
              >
                <Barcode size={16} />
              </span>
            </div>
          </div>
        )}
      </div>

      {!isFootwearCat && (newProductMode || selectedProductId) && (
        <p style={{ ...helperText, marginTop: "8px" }}>
          Barcode will be auto-generated for non-footwear items.
        </p>
      )}
    </>
  );
}
