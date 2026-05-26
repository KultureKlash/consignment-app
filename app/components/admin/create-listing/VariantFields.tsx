import { Barcode } from "lucide-react";
import { useCreateListing } from "./CreateListingContext";
import { compareSizes } from "~/lib/size-order";

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
            <div
              className={`flex flex-wrap gap-1.5 rounded-lg p-1 -m-1 ${fieldErrors.has("size") ? "ring-1 ring-red-500" : ""}`}
            >
              {[...selectedProduct.variants]
                .sort((a, b) => compareSizes(a.size, b.size))
                .map((v) => {
                  const isSelected = formFields.size === v.size;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        const variantGtin = v.gtin ?? "";
                        setFormFields({ ...formFields, size: v.size, gtin: variantGtin });
                        setGtinLocked(variantGtin.length > 0);
                        clearError("size");
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:bg-gray-50"
                      }`}
                    >
                      {v.size}
                    </button>
                  );
                })}
              <button
                type="button"
                onClick={() => {
                  setNewSizeMode(true);
                  setFormFields({ ...formFields, size: "", gtin: "" });
                  setGtinLocked(false);
                }}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-dashed border-indigo-300 cursor-pointer transition-colors"
              >
                + New size
              </button>
            </div>
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
            <span className={`absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium pointer-events-none ${formFields.setPriceLater ? "text-gray-300" : "text-gray-500"}`}>
              $
            </span>
            <input
              type="number"
              value={formFields.setPriceLater ? "" : formFields.price}
              onChange={(e) => {
                setFormFields({ ...formFields, price: e.target.value });
                clearError("price");
              }}
              placeholder={formFields.setPriceLater ? "Consignor will set price" : "0.00"}
              min="1"
              step="1"
              disabled={formFields.setPriceLater}
              className={`${formFields.setPriceLater ? "admin-input-disabled" : "admin-input"} !pl-[30px]${fieldErrors.has("price") ? " !border-red-500" : ""}`}
            />
          </div>
          <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs text-gray-600">
            <input
              type="checkbox"
              checked={formFields.setPriceLater}
              onChange={(e) => {
                setFormFields({ ...formFields, setPriceLater: e.target.checked, price: e.target.checked ? "" : formFields.price });
                clearError("price");
              }}
              className="cursor-pointer"
            />
            <span>Set price later (consignor will input)</span>
          </label>
          {formFields.setPriceLater && (
            <p className="admin-helper-text mt-1">Listing will park in "Needs Price" status — not live on Shopify until priced.</p>
          )}
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
