import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Search } from "lucide-react";
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

  return (
    <s-section heading="Create Listing">
      {/* Consignor selector */}
      <div style={{ marginBottom: "20px" }}>
        <label style={labelStyle}>Consignor</label>
        {consignors.length === 0 ? (
          <p style={{ color: "#6d7175", fontSize: "13px" }}>No consignors found. Add one in the Consignors page.</p>
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

      {/* Product selector */}
      <div style={{ marginBottom: "20px" }}>
        <label style={labelStyle}>Product</label>

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
            <div style={{ marginBottom: "8px" }}>
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
                style={{ cursor: "pointer", color: "#4f46e5", fontSize: "13px", fontWeight: 500 }}
              >
                ← Back to search
              </span>
            </div>

            {/* Category selects */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={labelStyle}>Category</label>
                <CustomSelect
                  options={MAIN_CATEGORIES}
                  value={mainCategory}
                  onChange={(val) => {
                    setMainCategory(val);
                    setSubCategory("");
                    setCategoryManual(true);
                  }}
                  placeholder="Select category..."
                />
              </div>
              <div>
                <label style={labelStyle}>Subcategory</label>
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
              <div style={{ marginBottom: "12px" }}>
                <label style={labelStyle}>Shopify Product Category</label>
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

            {/* Product fields — Style ID only for footwear */}
            <div style={{ display: "grid", gridTemplateColumns: isFootwearCat ? "1fr 2fr 1fr" : "2fr 1fr", gap: "12px" }}>
              {isFootwearCat && (
                <div>
                  <label style={labelStyle}>Style ID</label>
                  <input
                    type="text"
                    value={formFields.styleId}
                    onChange={(e) => { setFormFields({ ...formFields, styleId: e.target.value }); clearError("styleId"); }}
                    onFocus={handleFocus}
                    onBlur={handleBlurStyle}
                    placeholder="e.g. DD1391-100"
                    style={{ ...inputStyle, ...(fieldErrors.has("styleId") ? { borderColor: "#ef4444" } : {}) }}
                  />
                </div>
              )}
              <div>
                <label style={labelStyle}>Title</label>
                <input
                  type="text"
                  value={formFields.title}
                  onChange={(e) => { setFormFields({ ...formFields, title: e.target.value }); clearError("title"); }}
                  onFocus={handleFocus}
                  onBlur={handleBlurStyle}
                  placeholder="e.g. Nike Dunk Panda"
                  style={{ ...inputStyle, ...(fieldErrors.has("title") ? { borderColor: "#ef4444" } : {}) }}
                />
              </div>
              <div ref={brandInputRef}>
                <label style={labelStyle}>Brand</label>
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

            {/* Product Image */}
            <div style={{ marginBottom: "12px" }}>
              <label style={labelStyle}>Product Image</label>
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
                      width: "120px",
                      height: "120px",
                      objectFit: "cover",
                      borderRadius: "8px",
                      border: "1px solid #e3e3e3",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => { setImagePreview(null); setImageBase64(null); }}
                    style={{
                      position: "absolute",
                      top: "-6px",
                      right: "-6px",
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      background: "#1a1a1a",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => imageInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "#4f46e5"; }}
                  onDragLeave={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = "#d1d5db";
                    const file = e.dataTransfer.files[0];
                    if (file) handleImageSelect(file);
                  }}
                  style={{
                    width: "120px",
                    height: "120px",
                    border: "2px dashed #d1d5db",
                    borderRadius: "8px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "border-color 0.15s ease-out",
                    gap: "4px",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#9ca3af"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; }}
                >
                  <ImagePlus size={24} color="#9ca3af" />
                  <span style={{ fontSize: "11px", color: "#9ca3af" }}>Upload</span>
                </div>
              )}
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
                  color: "#4f46e5",
                  fontWeight: 600,
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
      </div>

      {/* Category selects for existing product */}
      {selectedProductId && selectedProduct && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          <div>
            <label style={labelStyle}>Category</label>
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
            <label style={labelStyle}>Subcategory</label>
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

      {/* Variant details — GTIN only for footwear */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isFootwearCat ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr",
        gap: "12px",
        marginBottom: "16px",
      }}>
        <div>
          <label style={labelStyle}>Size</label>
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
          ) : (
            <input
              type="text"
              value={formFields.size}
              onChange={(e) => { setFormFields({ ...formFields, size: e.target.value }); clearError("size"); }}
              onFocus={handleFocus}
              onBlur={handleBlurStyle}
              placeholder={isFootwearCat ? "e.g. 9" : "e.g. M, L, XL"}
              style={{ ...inputStyle, ...(fieldErrors.has("size") ? { borderColor: "#ef4444" } : {}) }}
            />
          )}
        </div>
        {isFootwearCat && (
          <div>
            <label style={labelStyle}>GTIN (barcode)</label>
            <input
              type="text"
              value={formFields.gtin}
              onChange={(e) => { setFormFields({ ...formFields, gtin: e.target.value }); clearError("gtin"); }}
              onFocus={handleFocus}
              onBlur={handleBlurStyle}
              placeholder="e.g. 194956806653"
              disabled={gtinLocked}
              style={{ ...(gtinLocked ? disabledInput : inputStyle), ...(fieldErrors.has("gtin") ? { borderColor: "#ef4444" } : {}) }}
            />
          </div>
        )}
        <div>
          <label style={labelStyle}>Price ($)</label>
          <input
            type="number"
            value={formFields.price}
            onChange={(e) => { setFormFields({ ...formFields, price: e.target.value }); clearError("price"); }}
            onFocus={handleFocus}
            onBlur={handleBlurStyle}
            placeholder="e.g. 340"
            min="1"
            step="1"
            style={{ ...inputStyle, ...(fieldErrors.has("price") ? { borderColor: "#ef4444" } : {}) }}
          />
        </div>
        <div>
          <label style={labelStyle}>Quantity</label>
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

      {!isFootwearCat && (newProductMode || selectedProductId) && (
        <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "-12px", marginBottom: "16px" }}>
          Barcode will be auto-generated for non-footwear items.
        </p>
      )}

      <s-button
        variant="primary"
        onClick={() => {
          const errors = new Set<string>();
          if (!selectedConsignor) errors.add("consignorId");
          if (!formFields.title.trim()) errors.add("title");
          if (!formFields.size.trim()) errors.add("size");
          if (isFootwearCat && !formFields.styleId.trim()) errors.add("styleId");
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
        {...(isLoading ? { disabled: true } : {})}
      >
        {isLoading ? "Creating..." : "Create Listing"}
      </s-button>
    </s-section>
  );
}
