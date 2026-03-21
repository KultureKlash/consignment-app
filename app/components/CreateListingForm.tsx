import { useCallback, useEffect, useRef, useState } from "react";
import { X, Search, Camera, User, Package, Tag, Barcode } from "lucide-react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { CATEGORIES, MAIN_CATEGORIES, autoSuggest, buildCategory } from "~/lib/categories";
import { processProductImage } from "~/lib/image-processing";
import Dropdown, { dropdownItemStyle, handleItemHover } from "~/components/Dropdown";
import CustomSelect from "~/components/CustomSelect";
import {
  inputStyle, searchInputStyle, disabledInput, labelStyle,
  chipStyle, chipClear, searchIconWrap,
  handleFocus, handleBlurStyle,
  type ProductResult,
} from "~/lib/listing-ui";

type Consignor = {
  id: string;
  name: string;
  email: string;
  feeRate: number;
};

type Props = {
  consignors: Consignor[];
  knownBrands: string[];
};

// ── Section card styles ──

const sectionCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(227,227,227,0.6)",
  borderRadius: "12px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  overflow: "hidden",
  marginBottom: "20px",
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid rgba(227,227,227,0.5)",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#1a1a1a",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  margin: 0,
};

const sectionBody: React.CSSProperties = {
  padding: "20px",
};

const fieldLabel: React.CSSProperties = {
  ...labelStyle,
  fontSize: "12px",
  fontWeight: 600,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "6px",
};

const helperText: React.CSSProperties = {
  fontSize: "11px",
  color: "#9ca3af",
  marginTop: "4px",
};

function SectionHeader({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: string }) {
  return (
    <div style={sectionHeaderStyle}>
      <Icon size={15} color="#6d7175" />
      <h3 style={sectionTitleStyle}>{title}</h3>
      {badge && (
        <span style={{
          marginLeft: "auto",
          fontSize: "10px",
          fontWeight: 600,
          color: "#6d7175",
          background: "#f3f4f6",
          padding: "2px 8px",
          borderRadius: "9999px",
        }}>
          {badge}
        </span>
      )}
    </div>
  );
}

export default function CreateListingForm({ consignors, knownBrands }: Props) {
  const fetcher = useFetcher();
  const productFetcher = useFetcher<{ products: ProductResult[] }>();
  const brandFetcher = useFetcher<{ brands: string[] }>();
  const taxonomyFetcher = useFetcher<{ categories: Array<{ id: string; fullName: string }> }>();
  const shopify = useAppBridge();

  // Refs for portal-based dropdowns
  const consignorInputRef = useRef<HTMLDivElement>(null);
  const productInputRef = useRef<HTMLDivElement>(null);
  const brandInputRef = useRef<HTMLDivElement>(null);
  const taxonomyInputRef = useRef<HTMLDivElement>(null);

  // Consignor state
  const [selectedConsignor, setSelectedConsignor] = useState("");
  const [consignorSearch, setConsignorSearch] = useState("");
  const [showConsignorResults, setShowConsignorResults] = useState(false);

  const selectedConsignorObj = consignors.find((c) => c.id === selectedConsignor);
  const filteredConsignors = consignorSearch.trim()
    ? consignors.filter((c) =>
        c.name.toLowerCase().includes(consignorSearch.toLowerCase()) ||
        c.email.toLowerCase().includes(consignorSearch.toLowerCase())
      )
    : consignors;

  // Product state
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(null);
  const [gtinLocked, setGtinLocked] = useState(false);
  const [newSizeMode, setNewSizeMode] = useState(false);
  const [newProductMode, setNewProductMode] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [formFields, setFormFields] = useState({
    styleId: "", title: "", brand: "", size: "", gtin: "", price: "", quantity: "1",
  });
  const [mainCategory, setMainCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [categoryManual, setCategoryManual] = useState(false);

  // Brand autocomplete state
  const [brandSearch, setBrandSearch] = useState("");
  const [showBrandResults, setShowBrandResults] = useState(false);

  // Shopify taxonomy override state
  const [shopifyCategory, setShopifyCategory] = useState<{ id: string; fullName: string } | null>(null);
  const [taxonomySearch, setTaxonomySearch] = useState("");
  const [showTaxonomyResults, setShowTaxonomyResults] = useState(false);
  const [taxonomyEditMode, setTaxonomyEditMode] = useState(false);

  // Image upload state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) {
      shopify.toast.show("Image must be under 10MB");
      return;
    }
    try {
      const processed = await processProductImage(file);
      setImagePreview(processed);
      setImageBase64(processed);
    } catch {
      shopify.toast.show("Failed to process image");
    }
  }, [shopify]);

  // Validation error state
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  const clearError = (field: string) =>
    setFieldErrors((prev) => { const next = new Set(prev); next.delete(field); return next; });

  // Derived
  const isFootwearCat = !mainCategory || mainCategory === "Footwear";
  const searchResults = productSearch.trim() ? (productFetcher.data?.products ?? []) : [];
  const isSearching = productSearch.trim() !== "" && productFetcher.state === "loading";
  const brandResults = brandSearch.trim() ? (brandFetcher.data?.brands ?? []) : [];
  const taxonomyResults = taxonomySearch.trim() ? (taxonomyFetcher.data?.categories ?? []) : [];
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  // Auto-suggest brand + category from title
  useEffect(() => {
    if (!formFields.title || categoryManual) return;
    const suggestion = autoSuggest(formFields.title);

    if (!formFields.brand) {
      if (suggestion.brand) {
        setFormFields((prev) => ({ ...prev, brand: suggestion.brand! }));
      } else {
        const titleLower = formFields.title.toLowerCase();
        const match = [...knownBrands]
          .sort((a, b) => b.length - a.length)
          .find((b) => titleLower.includes(b.toLowerCase()));
        if (match) {
          setFormFields((prev) => ({ ...prev, brand: match }));
        }
      }
    }

    if (suggestion.mainCategory && !mainCategory) {
      setMainCategory(suggestion.mainCategory);
      if (suggestion.subCategory) setSubCategory(suggestion.subCategory);
      // Auto-fill O/S for Accessories & Headwear
      if ((suggestion.mainCategory === "Accessories" || suggestion.mainCategory === "Headwear") && !formFields.size) {
        setFormFields((prev) => ({ ...prev, size: "O/S" }));
      }
    }
  }, [formFields.title]);

  // Debounced product search
  useEffect(() => {
    if (!productSearch.trim()) return;
    const timer = setTimeout(() => {
      productFetcher.load(`/app/api/products?q=${encodeURIComponent(productSearch)}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  // Debounced brand search
  useEffect(() => {
    if (!brandSearch.trim()) return;
    const timer = setTimeout(() => {
      brandFetcher.load(`/app/api/brands?q=${encodeURIComponent(brandSearch)}`);
    }, 250);
    return () => clearTimeout(timer);
  }, [brandSearch]);

  // Debounced taxonomy search
  useEffect(() => {
    if (!taxonomySearch.trim()) return;
    const timer = setTimeout(() => {
      taxonomyFetcher.load(`/app/api/taxonomy?q=${encodeURIComponent(taxonomySearch)}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [taxonomySearch]);

  // Handle action responses
  useEffect(() => {
    const data = fetcher.data as Record<string, unknown> | undefined;
    if (!data) return;

    if (data.error) {
      shopify.toast.show(data.error as string);
      return;
    }

    const intent = data.intent as string;
    if (intent === "create") {
      const qty = (data as Record<string, unknown>).quantity ?? 1;
      shopify.toast.show(`${qty} listing(s) created`);
      setFormFields({ styleId: "", title: "", brand: "", size: "", gtin: "", price: "", quantity: "1" });
      setSelectedProductId(null);
      setSelectedProduct(null);
      setGtinLocked(false);
      setNewSizeMode(false);
      setNewProductMode(false);
      setProductSearch("");
      setMainCategory("");
      setSubCategory("");
      setCategoryManual(false);
      setBrandSearch("");
      setShopifyCategory(null);
      setTaxonomySearch("");
      setTaxonomyEditMode(false);
      setFieldErrors(new Set());
      setImagePreview(null);
      setImageBase64(null);
    }
  }, [fetcher.data, shopify]);

  const resetAll = () => {
    setSelectedProductId(null);
    setSelectedProduct(null);
    setGtinLocked(false);
    setNewSizeMode(false);
    setProductSearch("");
    setFormFields({ styleId: "", title: "", brand: "", size: "", gtin: "", price: "", quantity: "1" });
    setMainCategory("");
    setSubCategory("");
    setCategoryManual(false);
    setBrandSearch("");
    setShopifyCategory(null);
    setTaxonomySearch("");
    setTaxonomyEditMode(false);
    setImagePreview(null);
    setImageBase64(null);
  };

  const hasProduct = selectedProductId || newProductMode;

  return (
    <div>
      {/* ─── Section 1: Consignor ─── */}
      <div style={sectionCard}>
        <SectionHeader icon={User} title="Consignor" badge="Required" />
        <div style={sectionBody}>
          {consignors.length === 0 ? (
            <p style={{ color: "#6d7175", fontSize: "13px", margin: 0 }}>No consignors found. Add one in the Consignors page.</p>
          ) : selectedConsignorObj ? (
            <div style={chipStyle}>
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: 500 }}>{selectedConsignorObj.name}</span>
                <span style={{ color: "#6b7280" }}> ({(selectedConsignorObj.feeRate * 100).toFixed(0)}% fee) — {selectedConsignorObj.email}</span>
              </span>
              <span
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSelectedConsignor("");
                  setConsignorSearch("");
                }}
                style={chipClear}
              >
                ✕
              </span>
            </div>
          ) : (
            <div ref={consignorInputRef} style={{ position: "relative" }}>
              <span style={searchIconWrap}><Search size={16} /></span>
              <input
                type="text"
                value={consignorSearch}
                onChange={(e) => {
                  setConsignorSearch(e.target.value);
                  setShowConsignorResults(true);
                }}
                onFocus={(e) => {
                  setShowConsignorResults(true);
                  handleFocus(e);
                }}
                onBlur={(e) => {
                  setTimeout(() => setShowConsignorResults(false), 200);
                  handleBlurStyle(e);
                }}
                placeholder="Search consignor by name or email..."
                style={{ ...searchInputStyle, ...(fieldErrors.has("consignorId") ? { borderColor: "#ef4444" } : {}) }}
              />
              <Dropdown anchorRef={consignorInputRef} open={showConsignorResults}>
                {filteredConsignors.map((c) => (
                  <div
                    key={c.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSelectedConsignor(c.id);
                      setConsignorSearch("");
                      setShowConsignorResults(false);
                      clearError("consignorId");
                    }}
                    style={dropdownItemStyle}
                    onMouseEnter={(e) => handleItemHover(e, true)}
                    onMouseLeave={(e) => handleItemHover(e, false)}
                  >
                    <div style={{ fontWeight: 600, color: "#1a1a1a", fontSize: "14px" }}>{c.name}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                      {(c.feeRate * 100).toFixed(0)}% fee — {c.email}
                    </div>
                  </div>
                ))}
                {consignorSearch.trim() && filteredConsignors.length === 0 && (
                  <div style={{ padding: "10px 14px", color: "#9ca3af", fontSize: "13px", textAlign: "center" }}>
                    No consignors found
                  </div>
                )}
              </Dropdown>
            </div>
          )}
        </div>
      </div>

      {/* ─── Section 2: Product ─── */}
      <div style={sectionCard}>
        <SectionHeader icon={Package} title="Product" badge={hasProduct ? "Selected" : "Required"} />
        <div style={sectionBody}>
          {/* State A: Product selected — show chip */}
          {selectedProductId && selectedProduct && (
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
          )}

          {/* State B: New product mode — show editable fields */}
          {!selectedProductId && newProductMode && (
            <>
              <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
                <span
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setNewProductMode(false);
                    setFormFields({ ...formFields, styleId: "", title: "", brand: "" });
                    setMainCategory("");
                    setSubCategory("");
                    setCategoryManual(false);
                    setBrandSearch("");
                    setShopifyCategory(null);
                    setTaxonomyEditMode(false);
                    setTaxonomySearch("");
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
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(17,24,39,0.12)"; e.currentTarget.style.borderColor = "rgba(17,24,39,0.25)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(17,24,39,0.06)"; e.currentTarget.style.borderColor = "rgba(17,24,39,0.15)"; }}
                >
                  ← Back to search
                </span>
                <span style={{ fontSize: "12px", color: "#9ca3af" }}>Product not in catalog — enter details manually</span>
              </div>

              {/* Product fields — Row 1: Name / Brand */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <label style={fieldLabel}>Product Name</label>
                  <input
                    type="text"
                    value={formFields.title}
                    onChange={(e) => { setFormFields({ ...formFields, title: e.target.value }); clearError("title"); }}
                    onFocus={handleFocus}
                    onBlur={handleBlurStyle}
                    placeholder="e.g. Nike Air Max 90"
                    style={{ ...inputStyle, ...(fieldErrors.has("title") ? { borderColor: "#ef4444" } : {}) }}
                  />
                </div>
                <div ref={brandInputRef}>
                  <label style={fieldLabel}>Brand</label>
                  <input
                    type="text"
                    value={formFields.brand}
                    onChange={(e) => {
                      setFormFields({ ...formFields, brand: e.target.value });
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
                  <Dropdown anchorRef={brandInputRef} open={showBrandResults && brandResults.length > 0}>
                    {brandResults.map((b) => (
                      <div
                        key={b}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setFormFields({ ...formFields, brand: b });
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

              {/* Category selects */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
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
                <div style={{ marginBottom: "16px" }}>
                  <label style={fieldLabel}>Shopify Product Category</label>
                  {!taxonomyEditMode ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
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
                          <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Auto-detected from category</span>
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
                      <span style={searchIconWrap}><Search size={16} /></span>
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
                      <Dropdown anchorRef={taxonomyInputRef} open={showTaxonomyResults && taxonomySearch.trim().length > 0}>
                        {taxonomyFetcher.state === "loading" && (
                          <div style={{ padding: "10px 14px", color: "#9ca3af", fontSize: "13px", textAlign: "center" }}>
                            Searching...
                          </div>
                        )}
                        {taxonomyFetcher.state !== "loading" && taxonomyResults.map((cat) => (
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
                        {taxonomyFetcher.state !== "loading" && taxonomySearch.trim() && taxonomyResults.length === 0 && (
                          <div style={{ padding: "10px 14px", color: "#9ca3af", fontSize: "13px", textAlign: "center" }}>
                            No categories found
                          </div>
                        )}
                      </Dropdown>
                    </div>
                  )}
                </div>
              )}

              {/* Style ID / Photo */}
              <div style={{ display: "grid", gridTemplateColumns: isFootwearCat ? "1fr 1fr" : "1fr", gap: "16px" }}>
                {isFootwearCat && (
                  <div>
                    <label style={fieldLabel}>Style ID <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span></label>
                    <input
                      type="text"
                      value={formFields.styleId}
                      onChange={(e) => setFormFields({ ...formFields, styleId: e.target.value })}
                      onFocus={handleFocus}
                      onBlur={handleBlurStyle}
                      placeholder="e.g. DD1391-100"
                      style={inputStyle}
                    />
                    <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
                      Helps match products across listings
                    </div>
                  </div>
                )}
                <div>
                  <label style={fieldLabel}>Photo</label>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageSelect(file);
                      e.target.value = "";
                    }}
                  />
                  {imagePreview ? (
                    <div style={{ position: "relative", display: "inline-block" }}>
                      <img
                        src={imagePreview}
                        alt="Product preview"
                        style={{
                          width: "100%",
                          height: "80px",
                          objectFit: "cover",
                          borderRadius: "10px",
                          border: "1px solid #e3e3e3",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => { setImagePreview(null); setImageBase64(null); }}
                        style={{
                          position: "absolute",
                          top: "-8px",
                          right: "-8px",
                          width: "22px",
                          height: "22px",
                          borderRadius: "50%",
                          background: "#1a1a1a",
                          color: "#fff",
                          border: "2px solid #fff",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0,
                          boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
                        }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => imageInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "#4f46e5"; e.currentTarget.style.background = "#f8f7ff"; }}
                      onDragLeave={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.background = "#fafafa"; }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = "#d1d5db";
                        e.currentTarget.style.background = "#fafafa";
                        const file = e.dataTransfer.files[0];
                        if (file) handleImageSelect(file);
                      }}
                      style={{
                        width: "100%",
                        height: "80px",
                        border: "2px dashed #d1d5db",
                        borderRadius: "10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        gap: "8px",
                        background: "#fafafa",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#9ca3af"; e.currentTarget.style.background = "#f5f5f5"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.background = "#fafafa"; }}
                    >
                      <Camera size={20} color="#9ca3af" />
                      <span style={{ fontSize: "12px", color: "#6d7175", fontWeight: 500 }}>Upload photo</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* State C: Search mode — show search input + dropdown */}
          {!selectedProductId && !newProductMode && (
            <div ref={productInputRef} style={{ position: "relative" }}>
              <span style={searchIconWrap}><Search size={16} /></span>
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
                  <div style={{ padding: "10px 14px", color: "#9ca3af", fontSize: "13px", textAlign: "center" }}>
                    Searching...
                  </div>
                )}
                {!isSearching && searchResults.map((p) => (
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
                        size: "", gtin: "", price: "", quantity: "1",
                      });
                      if (p.category) {
                        const parts = p.category.split(" > ");
                        setMainCategory(parts[0]);
                        setSubCategory(parts[1] ?? "");
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
                    <div style={{ fontWeight: 600, color: "#1a1a1a", fontSize: "14px" }}>{p.title}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                      {p.styleId ?? p.brand ?? "No style ID"}{p.styleId && p.brand ? ` — ${p.brand}` : ""} · {p.variants.length} size{p.variants.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                ))}
                {!isSearching && productSearch.trim() && searchResults.length === 0 && (
                  <div style={{ padding: "10px 14px", color: "#9ca3af", fontSize: "13px", textAlign: "center" }}>
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
          )}

          {/* Category selects for existing product */}
          {selectedProductId && selectedProduct && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "16px" }}>
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
          )}
        </div>
      </div>

      {/* ─── Section 3: Variant & Pricing ─── */}
      <div style={sectionCard}>
        <SectionHeader icon={Tag} title="Size & Pricing" />
        <div style={sectionBody}>
          <div style={{
            display: "grid",
            gridTemplateColumns: isFootwearCat ? "1fr 1fr" : "1fr 1fr",
            gap: "16px",
            marginBottom: "16px",
          }}>
            <div>
              <label style={fieldLabel}>Size</label>
              {selectedProduct && !newSizeMode ? (
                <CustomSelect
                  options={selectedProduct.variants.map((v) => v.size)}
                  value={formFields.size}
                  onChange={(val) => {
                    const existingVariant = selectedProduct.variants.find((v) => v.size === val);
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
                  onChange={(e) => { setFormFields({ ...formFields, size: e.target.value }); clearError("size"); }}
                  onFocus={handleFocus}
                  onBlur={handleBlurStyle}
                  placeholder="e.g. 10"
                  min="1"
                  max="99"
                  step="0.5"
                  style={{ ...inputStyle, ...(fieldErrors.has("size") ? { borderColor: "#ef4444" } : {}) }}
                />
              ) : (
                <input
                  type="text"
                  value={formFields.size}
                  onChange={(e) => { setFormFields({ ...formFields, size: e.target.value }); clearError("size"); }}
                  onFocus={handleFocus}
                  onBlur={handleBlurStyle}
                  placeholder="e.g. M, L, XL"
                  style={{ ...inputStyle, ...(fieldErrors.has("size") ? { borderColor: "#ef4444" } : {}) }}
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

          <div style={{
            display: "grid",
            gridTemplateColumns: isFootwearCat ? "1fr 1fr" : "1fr",
            gap: "16px",
          }}>
            <div>
              <label style={fieldLabel}>Price</label>
              <div style={{ position: "relative" }}>
                <span style={{
                  position: "absolute",
                  left: "14px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#6d7175",
                  fontSize: "14px",
                  fontWeight: 500,
                  pointerEvents: "none",
                }}>$</span>
                <input
                  type="number"
                  value={formFields.price}
                  onChange={(e) => { setFormFields({ ...formFields, price: e.target.value }); clearError("price"); }}
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
            {isFootwearCat && (
              <div>
                <label style={fieldLabel}>GTIN / Barcode</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    value={formFields.gtin}
                    onChange={(e) => { setFormFields({ ...formFields, gtin: e.target.value }); clearError("gtin"); }}
                    onFocus={handleFocus}
                    onBlur={handleBlurStyle}
                    placeholder="Scan or enter GTIN"
                    disabled={gtinLocked}
                    style={{ ...(gtinLocked ? disabledInput : inputStyle), paddingRight: "36px", ...(fieldErrors.has("gtin") ? { borderColor: "#ef4444" } : {}) }}
                  />
                  <span style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                    color: gtinLocked ? "#d1d5db" : "#059669",
                  }}>
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
        </div>
      </div>

      {/* ─── Submit ─── */}
      <button
        onClick={() => {
          const errors = new Set<string>();
          if (!selectedConsignor) errors.add("consignorId");
          if (!formFields.title.trim()) errors.add("title");
          if (!formFields.size.trim()) errors.add("size");
          if (isFootwearCat && formFields.size.trim()) {
            const sizeNum = Number(formFields.size);
            if (isNaN(sizeNum) || sizeNum < 1 || sizeNum > 99 || (sizeNum % 1 !== 0 && sizeNum % 1 !== 0.5)) {
              errors.add("size");
            }
          }
          if (isFootwearCat && !formFields.gtin.trim()) errors.add("gtin");
          const price = Number(formFields.price);
          if (isNaN(price) || price <= 0) errors.add("price");

          if (errors.size > 0) {
            setFieldErrors(errors);
            shopify.toast.show("Please fill in all required fields");
            return;
          }

          setFieldErrors(new Set());
          const category = mainCategory ? buildCategory(mainCategory, subCategory || undefined) : "";
          fetcher.submit(
            {
              intent: "create",
              consignorId: selectedConsignor,
              ...formFields,
              category,
              ...(shopifyCategory ? { shopifyCategoryId: shopifyCategory.id } : {}),
              ...(imageBase64 ? { image: imageBase64 } : {}),
            },
            { method: "POST" }
          );
        }}
        disabled={isLoading}
        style={{
          width: "100%",
          padding: "16px 24px",
          fontSize: "15px",
          fontWeight: 600,
          color: "#fff",
          background: isLoading ? "#374151" : "#111827",
          border: "none",
          borderRadius: "10px",
          cursor: isLoading ? "not-allowed" : "pointer",
          transition: "all 0.2s ease",
          fontFamily: "inherit",
          boxShadow: isLoading ? "none" : "0 2px 8px rgba(0,0,0,0.2)",
          marginBottom: "24px",
          letterSpacing: "0.01em",
        }}
        onMouseEnter={(e) => { if (!isLoading) { e.currentTarget.style.background = "#1f2937"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.25)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
        onMouseLeave={(e) => { if (!isLoading) { e.currentTarget.style.background = "#111827"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)"; e.currentTarget.style.transform = "translateY(0)"; } }}
      >
        {isLoading ? "Creating..." : "Create Listing"}
      </button>
    </div>
  );
}
