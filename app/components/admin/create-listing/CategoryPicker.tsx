import { Search } from "lucide-react";
import { CATEGORIES, MAIN_CATEGORIES } from "~/lib/categories";
import Dropdown from "~/components/admin/shared/Dropdown";
import CustomSelect from "~/components/admin/shared/CustomSelect";
import { useCreateListing } from "./CreateListingContext";

export function NewProductCategoryPicker() {
  const {
    mainCategory,
    setMainCategory,
    subCategory,
    setSubCategory,
    setCategoryManual,
    formFields,
    setFormFields,
    taxonomyInputRef,
    taxonomyFetcher,
    shopifyCategory,
    setShopifyCategory,
    taxonomySearch,
    setTaxonomySearch,
    showTaxonomyResults,
    setShowTaxonomyResults,
    taxonomyEditMode,
    setTaxonomyEditMode,
    taxonomyResults,
  } = useCreateListing();

  return (
    <>
      {/* Category selects */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="admin-field-label">Category</label>
          <CustomSelect
            options={MAIN_CATEGORIES}
            value={mainCategory}
            onChange={(val) => {
              setMainCategory(val);
              setSubCategory("");
              setCategoryManual(true);
              // Auto-fill O/S for Accessories & Headwear, clear for Footwear
              if (val === "Accessories" || val === "Headwear") {
                if (!formFields.size) setFormFields((f) => ({ ...f, size: "O/S" }));
              } else if (val === "Footwear") {
                if (formFields.size === "O/S") setFormFields((f) => ({ ...f, size: "" }));
              }
            }}
            placeholder="Select category..."
          />
        </div>
        <div>
          <label className="admin-field-label">Subcategory</label>
          <CustomSelect
            options={mainCategory ? (CATEGORIES[mainCategory] ?? []) : []}
            value={subCategory}
            onChange={(val) => {
              setSubCategory(val);
              setCategoryManual(true);
            }}
            placeholder="Select subcategory..."
            disabled={!mainCategory}
          />
        </div>
      </div>

      {/* Shopify Product Category (taxonomy) */}
      {mainCategory && (
        <TaxonomyOverride
          taxonomyInputRef={taxonomyInputRef}
          taxonomyFetcher={taxonomyFetcher}
          shopifyCategory={shopifyCategory}
          setShopifyCategory={setShopifyCategory}
          taxonomySearch={taxonomySearch}
          setTaxonomySearch={setTaxonomySearch}
          showTaxonomyResults={showTaxonomyResults}
          setShowTaxonomyResults={setShowTaxonomyResults}
          taxonomyEditMode={taxonomyEditMode}
          setTaxonomyEditMode={setTaxonomyEditMode}
          taxonomyResults={taxonomyResults}
        />
      )}
    </>
  );
}

export function ExistingProductCategoryPicker() {
  const {
    mainCategory,
    setMainCategory,
    subCategory,
    setSubCategory,
    setCategoryManual,
    selectedProduct,
  } = useCreateListing();

  if (!selectedProduct) return null;

  return (
    <div className="grid grid-cols-2 gap-3 mt-4">
      <div>
        <label className="admin-field-label">Category</label>
        <CustomSelect
          options={MAIN_CATEGORIES}
          value={mainCategory}
          onChange={(val) => {
            setMainCategory(val);
            setSubCategory("");
            setCategoryManual(true);
          }}
          placeholder="Select category..."
          disabled={!!selectedProduct.category}
        />
      </div>
      <div>
        <label className="admin-field-label">Subcategory</label>
        <CustomSelect
          options={mainCategory ? (CATEGORIES[mainCategory] ?? []) : []}
          value={subCategory}
          onChange={(val) => {
            setSubCategory(val);
            setCategoryManual(true);
          }}
          placeholder="Select subcategory..."
          disabled={!mainCategory || !!selectedProduct.category}
        />
      </div>
    </div>
  );
}

function TaxonomyOverride({
  taxonomyInputRef,
  taxonomyFetcher,
  shopifyCategory,
  setShopifyCategory,
  taxonomySearch,
  setTaxonomySearch,
  showTaxonomyResults,
  setShowTaxonomyResults,
  taxonomyEditMode,
  setTaxonomyEditMode,
  taxonomyResults,
}: {
  taxonomyInputRef: React.RefObject<HTMLDivElement | null>;
  taxonomyFetcher: ReturnType<typeof import("react-router").useFetcher<{ categories: Array<{ id: string; fullName: string }> }>>;
  shopifyCategory: { id: string; fullName: string } | null;
  setShopifyCategory: (val: { id: string; fullName: string } | null) => void;
  taxonomySearch: string;
  setTaxonomySearch: (val: string) => void;
  showTaxonomyResults: boolean;
  setShowTaxonomyResults: (val: boolean) => void;
  taxonomyEditMode: boolean;
  setTaxonomyEditMode: (val: boolean) => void;
  taxonomyResults: Array<{ id: string; fullName: string }>;
}) {
  return (
    <div className="mb-4">
      <label className="admin-field-label">Shopify Product Category</label>
      {!taxonomyEditMode ? (
        <div className="flex items-center gap-2 text-[13px]">
          {shopifyCategory ? (
            <>
              <span className="text-gray-900">{shopifyCategory.fullName}</span>
              <span
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShopifyCategory(null);
                  setTaxonomyEditMode(true);
                  setTaxonomySearch("");
                }}
                className="cursor-pointer text-indigo-600 font-medium"
              >
                Change
              </span>
            </>
          ) : (
            <>
              <span className="text-gray-400 italic">
                Auto-detected from category
              </span>
              <span
                onMouseDown={(e) => {
                  e.preventDefault();
                  setTaxonomyEditMode(true);
                  setTaxonomySearch("");
                }}
                className="cursor-pointer text-indigo-600 font-medium"
              >
                Override
              </span>
            </>
          )}
        </div>
      ) : (
        <div ref={taxonomyInputRef} className="relative">
          <span className="admin-search-icon">
            <Search size={16} />
          </span>
          <input
            type="text"
            value={taxonomySearch}
            onChange={(e) => {
              setTaxonomySearch(e.target.value);
              setShowTaxonomyResults(true);
            }}
            onFocus={() => setShowTaxonomyResults(true)}
            onBlur={() => {
              setTimeout(() => {
                setShowTaxonomyResults(false);
                if (!taxonomySearch.trim()) setTaxonomyEditMode(false);
              }, 200);
            }}
            placeholder="Search Shopify categories..."
            className="admin-input-search"
            autoFocus
          />
          <Dropdown
            anchorRef={taxonomyInputRef}
            open={showTaxonomyResults && taxonomySearch.trim().length > 0}
          >
            {taxonomyFetcher.state === "loading" && (
              <div className="px-3.5 py-2.5 text-gray-400 text-[13px] text-center">
                Searching...
              </div>
            )}
            {taxonomyFetcher.state !== "loading" &&
              taxonomyResults.map((cat) => (
                <div
                  key={cat.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShopifyCategory(cat);
                    setTaxonomySearch("");
                    setShowTaxonomyResults(false);
                    setTaxonomyEditMode(false);
                  }}
                  className="admin-dropdown-item"
                >
                  <span className="font-medium text-gray-900">{cat.fullName}</span>
                </div>
              ))}
            {taxonomyFetcher.state !== "loading" &&
              taxonomySearch.trim() &&
              taxonomyResults.length === 0 && (
                <div className="px-3.5 py-2.5 text-gray-400 text-[13px] text-center">
                  No categories found
                </div>
              )}
          </Dropdown>
        </div>
      )}
    </div>
  );
}
