import { Search } from "lucide-react";
import {
  searchInputStyle,
  chipStyle,
  chipClear,
  searchIconWrap,
  handleFocus,
  handleBlurStyle,
} from "~/lib/admin/listing-ui";
import { parseCategory } from "~/lib/categories";
import Dropdown, { dropdownItemStyle, handleItemHover } from "~/components/admin/Dropdown";
import { useCreateListing } from "./CreateListingContext";

export default function ProductSearch() {
  const {
    productInputRef,
    productSearch,
    setProductSearch,
    showResults,
    setShowResults,
    isSearching,
    searchResults,
    selectedProductId,
    selectedProduct,
    newProductMode,
    formFields,
    setFormFields,
    setSelectedProductId,
    setSelectedProduct,
    setGtinLocked,
    setNewSizeMode,
    setNewProductMode,
    setMainCategory,
    setSubCategory,
    setCategoryManual,
    resetAll,
  } = useCreateListing();

  // State A: Product selected — show chip
  if (selectedProductId && selectedProduct) {
    return (
      <div style={chipStyle}>
        <span style={{ flex: 1 }}>
          <span style={{ fontWeight: 500 }}>{selectedProduct.title}</span>
          <span style={{ color: "#6b7280" }}>
            {selectedProduct.styleId ? ` (${selectedProduct.styleId})` : ""}
            {selectedProduct.brand ? ` — ${selectedProduct.brand}` : ""}
          </span>
        </span>
        <span
          onMouseDown={(e) => {
            e.preventDefault();
            resetAll();
          }}
          style={chipClear}
        >
          ✕
        </span>
      </div>
    );
  }

  // State C: Search mode — show search input + dropdown
  if (!selectedProductId && !newProductMode) {
    return (
      <div ref={productInputRef} style={{ position: "relative" }}>
        <span style={searchIconWrap}>
          <Search size={16} />
        </span>
        <input
          type="text"
          value={productSearch}
          onChange={(e) => {
            setProductSearch(e.target.value);
            setShowResults(true);
          }}
          onFocus={(e) => {
            setShowResults(true);
            handleFocus(e);
          }}
          onBlur={(e) => {
            setTimeout(() => setShowResults(false), 200);
            handleBlurStyle(e);
          }}
          placeholder="Search by name or style ID..."
          style={searchInputStyle}
        />
        <Dropdown anchorRef={productInputRef} open={showResults}>
          {isSearching && (
            <div
              style={{
                padding: "10px 14px",
                color: "#9ca3af",
                fontSize: "13px",
                textAlign: "center",
              }}
            >
              Searching...
            </div>
          )}
          {!isSearching &&
            searchResults.map((p) => (
              <div
                key={p.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSelectedProductId(p.id);
                  setSelectedProduct(p);
                  setProductSearch("");
                  setShowResults(false);
                  setGtinLocked(false);
                  setNewSizeMode(false);
                  setFormFields({
                    ...formFields,
                    styleId: p.styleId ?? "",
                    title: p.title,
                    brand: p.brand ?? "",
                    size: "",
                    gtin: "",
                    price: "",
                    quantity: "1",
                  });
                  if (p.category) {
                    const cat = parseCategory(p.category);
                    setMainCategory(cat.main);
                    setSubCategory(cat.sub ?? "");
                    setCategoryManual(true);
                  } else {
                    setMainCategory("");
                    setSubCategory("");
                    setCategoryManual(false);
                  }
                }}
                style={dropdownItemStyle}
                onMouseEnter={(e) => handleItemHover(e, true)}
                onMouseLeave={(e) => handleItemHover(e, false)}
              >
                <div style={{ fontWeight: 600, color: "#1a1a1a", fontSize: "14px" }}>
                  {p.title}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                  {p.styleId ?? p.brand ?? "No style ID"}
                  {p.styleId && p.brand ? ` — ${p.brand}` : ""} · {p.variants.length} size
                  {p.variants.length !== 1 ? "s" : ""}
                </div>
              </div>
            ))}
          {!isSearching && productSearch.trim() && searchResults.length === 0 && (
            <div
              style={{
                padding: "10px 14px",
                color: "#9ca3af",
                fontSize: "13px",
                textAlign: "center",
              }}
            >
              No products found
            </div>
          )}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setNewProductMode(true);
              setProductSearch("");
              setShowResults(false);
            }}
            style={{
              padding: "10px 14px",
              cursor: "pointer",
              fontSize: "14px",
              color: "#6d7175",
              fontWeight: 500,
              borderTop: "1px solid #f0f0f0",
              transition: "background 0.12s ease",
              margin: "4px 0 0 0",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            + Add new product
          </div>
        </Dropdown>
      </div>
    );
  }

  return null;
}
