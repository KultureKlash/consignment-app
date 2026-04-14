import { Barcode } from "lucide-react";
import CustomSelect from "~/components/admin/CustomSelect";
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
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="admin-field-label">Size</label>
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
              placeholder="e.g. 10"
              min="1"
              max="99"
              step="0.5"
              className={`admin-input${fieldErrors.has("size") ? " !border-red-500" : ""}`}
            />
          ) : (
            <input
              type="text"
              value={formFields.size}
              onChange={(e) => {
                setFormFields({ ...formFields, size: e.target.value });
                clearError("size");
              }}
              placeholder="e.g. M, L, XL"
              className={`admin-input${fieldErrors.has("size") ? " !border-red-500" : ""}`}
            />
          )}
        </div>
        <div>
          <label className="admin-field-label">Quantity</label>
          <input
            type="number"
            value={formFields.quantity}
            onChange={(e) => setFormFields({ ...formFields, quantity: e.target.value })}
            min="1"
            max="50"
            step="1"
            className="admin-input"
          />
        </div>
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: isFootwearCat ? "1fr 1fr" : "1fr" }}
      >
        <div>
          <label className="admin-field-label">Price</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium pointer-events-none">
              $
            </span>
            <input
              type="number"
              value={formFields.price}
              onChange={(e) => {
                setFormFields({ ...formFields, price: e.target.value });
                clearError("price");
              }}
              placeholder="0.00"
              min="1"
              step="1"
              className={`admin-input !pl-[30px]${fieldErrors.has("price") ? " !border-red-500" : ""}`}
            />
          </div>
        </div>
        {selectedConsignorObj?.storeOwned && (
          <div>
            <label className="admin-field-label">
              Cost <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium pointer-events-none">
                $
              </span>
              <input
                type="number"
                value={formFields.cost}
                onChange={(e) => setFormFields({ ...formFields, cost: e.target.value })}
                placeholder="0.00"
                min="0"
                step="1"
                className="admin-input !pl-[30px]"
              />
            </div>
            <p className="admin-helper-text">Acquisition cost for profit tracking</p>
          </div>
        )}
        {isFootwearCat && (
          <div>
            <label className="admin-field-label">GTIN / Barcode</label>
            <div className="relative">
              <input
                type="text"
                value={formFields.gtin}
                onChange={(e) => {
                  setFormFields({ ...formFields, gtin: e.target.value });
                  clearError("gtin");
                }}
                placeholder="Scan or enter GTIN"
                disabled={gtinLocked}
                className={`${gtinLocked ? "admin-input-disabled" : "admin-input"} !pr-9${fieldErrors.has("gtin") ? " !border-red-500" : ""}`}
              />
              <span
                className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${gtinLocked ? "text-gray-300" : "text-emerald-600"}`}
              >
                <Barcode size={16} />
              </span>
            </div>
          </div>
        )}
      </div>

      {!isFootwearCat && (newProductMode || selectedProductId) && (
        <p className="admin-helper-text mt-2">
          Barcode will be auto-generated for non-footwear items.
        </p>
      )}
    </>
  );
}
