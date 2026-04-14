import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import Dropdown, { dropdownItemStyle, handleItemHover } from "~/components/admin/Dropdown";
import { inputStyle, handleFocus, handleBlurStyle } from "~/lib/admin/listing-ui";
import { fieldLabel } from "./helpers";
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
      <div
        style={{
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <span
          onMouseDown={(e) => {
            e.preventDefault();
            onBack();
          }}
          style={{
            cursor: "pointer",
            color: "#111827",
            fontSize: "12px",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            background: "rgba(17,24,39,0.06)",
            padding: "6px 14px",
            borderRadius: "10px",
            border: "1px solid rgba(17,24,39,0.15)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(17,24,39,0.12)";
            e.currentTarget.style.borderColor = "rgba(17,24,39,0.25)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(17,24,39,0.06)";
            e.currentTarget.style.borderColor = "rgba(17,24,39,0.15)";
          }}
        >
          ← Back to search
        </span>
        <span style={{ fontSize: "12px", color: "#9ca3af" }}>
          Product not in catalog — enter details manually
        </span>
      </div>

      {/* Product fields — Row 1: Name / Brand */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          marginBottom: "16px",
        }}
      >
        <div>
          <label style={fieldLabel}>Product Name</label>
          <input
            type="text"
            value={formFields.title}
            onChange={(e) => {
              setFormFields((prev) => ({ ...prev, title: e.target.value }));
              clearError("title");
            }}
            onFocus={handleFocus}
            onBlur={handleBlurStyle}
            placeholder="e.g. Nike Air Max 90"
            style={{
              ...inputStyle,
              ...(fieldErrors.has("title") ? { borderColor: "#ef4444" } : {}),
            }}
          />
        </div>
        <div ref={brandInputRef}>
          <label style={fieldLabel}>Brand</label>
          <input
            type="text"
            value={formFields.brand}
            onChange={(e) => {
              setFormFields((prev) => ({ ...prev, brand: e.target.value }));
              setBrandSearch(e.target.value);
              setShowBrandResults(true);
            }}
            onFocus={(e) => {
              if (formFields.brand) {
                setBrandSearch(formFields.brand);
                setShowBrandResults(true);
              }
              handleFocus(e);
            }}
            onBlur={(e) => {
              setTimeout(() => setShowBrandResults(false), 200);
              handleBlurStyle(e);
            }}
            placeholder="e.g. Nike"
            style={inputStyle}
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
                style={dropdownItemStyle}
                onMouseEnter={(e) => handleItemHover(e, true)}
                onMouseLeave={(e) => handleItemHover(e, false)}
              >
                <span style={{ fontWeight: 500 }}>{b}</span>
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
