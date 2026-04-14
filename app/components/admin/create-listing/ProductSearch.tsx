import { Search } from "lucide-react";
import { parseCategory } from "~/lib/categories";
import Dropdown from "~/components/admin/Dropdown";
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
      <div className="admin-chip">
        <span className="flex-1">
          <span className="font-medium">{selectedProduct.title}</span>
          <span className="text-gray-500">
            {selectedProduct.sku ? ` (${selectedProduct.sku})` : ""}
            {selectedProduct.brand ? ` — ${selectedProduct.brand}` : ""}
          </span>
        </span>
        <span
          onMouseDown={(e) => {
            e.preventDefault();
            resetAll();
          }}
          className="admin-chip-clear"
        >
          ✕
        </span>
      </div>
    );
  }

  // State C: Search mode — show search input + dropdown
  if (!selectedProductId && !newProductMode) {
    return (
      <div ref={productInputRef} className="relative">
        <span className="admin-search-icon">
          <Search size={16} />
        </span>
        <input
          type="text"
          value={productSearch}
          onChange={(e) => {
            setProductSearch(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
          placeholder="Search by name or SKU..."
          className="admin-input-search"
        />
        <Dropdown anchorRef={productInputRef} open={showResults}>
          {isSearching && (
            <div className="px-3.5 py-2.5 text-gray-400 text-[13px] text-center">
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
                    sku: p.sku ?? "",
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
                className="admin-dropdown-item"
              >
                <div className="font-semibold text-gray-900 text-sm">
                  {p.title}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {p.sku ?? p.brand ?? "No SKU"}
                  {p.sku && p.brand ? ` — ${p.brand}` : ""} · {p.variants.length} size
                  {p.variants.length !== 1 ? "s" : ""}
                </div>
              </div>
            ))}
          {!isSearching && productSearch.trim() && searchResults.length === 0 && (
            <div className="px-3.5 py-2.5 text-gray-400 text-[13px] text-center">
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
            className="px-3.5 py-2.5 cursor-pointer text-sm text-gray-500 font-medium border-t border-gray-100 mt-1 transition-colors duration-100 hover:bg-gray-100"
          >
            + Add new product
          </div>
        </Dropdown>
      </div>
    );
  }

  return null;
}
