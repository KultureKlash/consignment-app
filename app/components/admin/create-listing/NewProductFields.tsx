import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import Dropdown from "~/components/admin/shared/Dropdown";
import { NewProductCategoryPicker } from "./CategoryPicker";
import ImageUpload from "./ImageUpload";
import { useCreateListing } from "./CreateListingContext";

export default function NewProductFields() {
  const {
    formFields,
    setFormFields,
    clearError,
    fieldErrors,
    setNewProductMode,
    setProductSearch,
    setShowResults,
  } = useCreateListing();

  const brandFetcher = useFetcher<{ brands: string[] }>();
  const [brandSearch, setBrandSearch] = useState("");
  const [showBrandResults, setShowBrandResults] = useState(false);
  const brandInputRef = useRef<HTMLDivElement>(null);

  const brandResults = brandSearch.trim() ? (brandFetcher.data?.brands ?? []) : [];

  // Debounced brand search
  useEffect(() => {
    if (!brandSearch.trim()) return;
    const timer = setTimeout(() => {
      brandFetcher.load(`/app/api/brands?q=${encodeURIComponent(brandSearch)}`);
    }, 250);
    return () => clearTimeout(timer);
  }, [brandSearch]);

  const onBack = () => {
    setNewProductMode(false);
    setProductSearch("");
    setShowResults(false);
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <span
          onMouseDown={(e) => {
            e.preventDefault();
            onBack();
          }}
          className="cursor-pointer text-gray-900 text-xs font-semibold inline-flex items-center gap-1 bg-gray-900/5 px-3.5 py-1.5 rounded-[10px] border border-gray-900/15 transition-all duration-200 hover:bg-gray-900/10 hover:border-gray-900/25"
        >
          ← Back to search
        </span>
        <span className="text-xs text-gray-400">
          Product not in catalog — enter details manually
        </span>
      </div>

      {/* Product fields — Row 1: Name / Brand */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="admin-field-label">Product Name</label>
          <input
            type="text"
            value={formFields.title}
            onChange={(e) => {
              setFormFields((prev) => ({ ...prev, title: e.target.value }));
              clearError("title");
            }}
            placeholder="e.g. Nike Air Max 90"
            className={`admin-input${fieldErrors.has("title") ? " !border-red-500" : ""}`}
          />
        </div>
        <div ref={brandInputRef}>
          <label className="admin-field-label">Brand</label>
          <input
            type="text"
            value={formFields.brand}
            onChange={(e) => {
              setFormFields((prev) => ({ ...prev, brand: e.target.value }));
              setBrandSearch(e.target.value);
              setShowBrandResults(true);
            }}
            onFocus={() => {
              if (formFields.brand) {
                setBrandSearch(formFields.brand);
                setShowBrandResults(true);
              }
            }}
            onBlur={() => setTimeout(() => setShowBrandResults(false), 200)}
            placeholder="e.g. Nike"
            className="admin-input"
          />
          <Dropdown
            anchorRef={brandInputRef}
            open={showBrandResults && brandResults.length > 0}
          >
            {brandResults.map((b) => (
              <div
                key={b}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setFormFields((prev) => ({ ...prev, brand: b }));
                  setBrandSearch("");
                  setShowBrandResults(false);
                }}
                className="admin-dropdown-item"
              >
                <span className="font-medium">{b}</span>
              </div>
            ))}
          </Dropdown>
        </div>
      </div>

      <NewProductCategoryPicker />

      <ImageUpload />
    </>
  );
}
