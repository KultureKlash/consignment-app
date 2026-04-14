import { Search } from "lucide-react";
import { CATEGORIES, MAIN_CATEGORIES } from "~/lib/categories";
import {
  searchInputStyle,
  searchIconWrap,
  handleFocus,
  handleBlurStyle,
} from "~/lib/admin/listing-ui";
import Dropdown, { dropdownItemStyle, handleItemHover } from "~/components/admin/Dropdown";
import CustomSelect from "~/components/admin/CustomSelect";
import { fieldLabel } from "./helpers";
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div>
          <label style={fieldLabel}>Category</label>
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
          <label style={fieldLabel}>Subcategory</label>
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "12px",
        marginTop: "16px",
      }}
    >
      <div>
        <label style={fieldLabel}>Category</label>
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
        <label style={fieldLabel}>Subcategory</label>
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
    <div style={{ marginBottom: "16px" }}>
      <label style={fieldLabel}>Shopify Product Category</label>
      {!taxonomyEditMode ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "13px",
          }}
        >
          {shopifyCategory ? (
            <>
              <span style={{ color: "#1a1a1a" }}>{shopifyCategory.fullName}</span>
              <span
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShopifyCategory(null);
                  setTaxonomyEditMode(true);
                  setTaxonomySearch("");
                }}
                style={{ cursor: "pointer", color: "#4f46e5", fontWeight: 500 }}
              >
                Change
              </span>
            </>
          ) : (
            <>
              <span style={{ color: "#9ca3af", fontStyle: "italic" }}>
                Auto-detected from category
              </span>
              <span
                onMouseDown={(e) => {
                  e.preventDefault();
                  setTaxonomyEditMode(true);
                  setTaxonomySearch("");
                }}
                style={{ cursor: "pointer", color: "#4f46e5", fontWeight: 500 }}
              >
                Override
              </span>
            </>
          )}
        </div>
      ) : (
        <div ref={taxonomyInputRef} style={{ position: "relative" }}>
          <span style={searchIconWrap}>
            <Search size={16} />
          </span>
          <input
            type="text"
            value={taxonomySearch}
            onChange={(e) => {
              setTaxonomySearch(e.target.value);
              setShowTaxonomyResults(true);
            }}
            onFocus={(e) => {
              setShowTaxonomyResults(true);
              handleFocus(e);
            }}
            onBlur={(e) => {
              setTimeout(() => {
                setShowTaxonomyResults(false);
                if (!taxonomySearch.trim()) setTaxonomyEditMode(false);
              }, 200);
              handleBlurStyle(e);
            }}
            placeholder="Search Shopify categories..."
            style={searchInputStyle}
            autoFocus
          />
          <Dropdown
            anchorRef={taxonomyInputRef}
            open={showTaxonomyResults && taxonomySearch.trim().length > 0}
          >
            {taxonomyFetcher.state === "loading" && (
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
                  style={dropdownItemStyle}
                  onMouseEnter={(e) => handleItemHover(e, true)}
                  onMouseLeave={(e) => handleItemHover(e, false)}
                >
                  <span style={{ fontWeight: 500, color: "#1a1a1a" }}>{cat.fullName}</span>
                </div>
              ))}
            {taxonomyFetcher.state !== "loading" &&
              taxonomySearch.trim() &&
              taxonomyResults.length === 0 && (
                <div
                  style={{
                    padding: "10px 14px",
                    color: "#9ca3af",
                    fontSize: "13px",
                    textAlign: "center",
                  }}
                >
                  No categories found
                </div>
              )}
          </Dropdown>
        </div>
      )}
    </div>
  );
}
