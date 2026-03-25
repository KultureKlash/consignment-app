import { useState, useEffect, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteLoaderData, useFetcher, useNavigate } from "react-router";
import { redirect } from "react-router";
import { ArrowLeft, Search, ChevronDown, TrendingDown, Clock, Camera, X, Plus, Package, Lightbulb } from "lucide-react";
import { processProductImage } from "~/lib/image-processing";
import { AppHeader } from "~/components/portal/AppHeader";
import { GlassSelect } from "~/components/portal/GlassSelect";
import { authenticatePortal } from "~/services/portal-auth.server";
import { submitListing } from "~/services/submission.server";
import { CATEGORIES, MAIN_CATEGORIES, isFootwear, buildCategory, autoSuggest } from "~/lib/categories";
import { fmt } from "~/lib/currency";
import type { loader as portalLoader } from "./portal";

export async function loader({ request }: LoaderFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");

  // Pre-fill product if productId param is provided (quick-add from listings)
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  let prefillProduct: ProductResult | null = null;
  if (productId) {
    const { default: prisma } = await import("~/db.server");
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { orderBy: { size: "asc" } } },
    });
    if (product) {
      prefillProduct = {
        id: product.id,
        styleId: product.styleId,
        title: product.title,
        brand: product.brand,
        category: product.category,
        imageUrl: product.imageUrl,
        variants: product.variants.map((v) => ({ id: v.id, size: v.size, gtin: v.gtin })),
      };
    }
  }

  return { consignor, prefillProduct };
}

export async function action({ request }: ActionFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");
  const form = await request.formData();

  const title = (form.get("title") as string ?? "").trim();
  const brand = (form.get("brand") as string ?? "").trim() || undefined;
  const mainCategory = (form.get("mainCategory") as string ?? "").trim();
  const subCategory = (form.get("subCategory") as string ?? "").trim();
  const category = mainCategory ? buildCategory(mainCategory, subCategory || undefined) : undefined;
  const styleId = (form.get("styleId") as string ?? "").trim() || undefined;
  const size = (form.get("size") as string ?? "").trim();
  const gtin = (form.get("gtin") as string ?? "").trim() || undefined;
  const price = parseFloat(form.get("price") as string);
  const count = parseInt(form.get("quantity") as string) || 1;
  const imageData = (form.get("imageData") as string ?? "").trim() || undefined;

  if (!title) return { error: "Product name is required" };
  if (!size) return { error: "Size is required" };
  if (isNaN(price) || price <= 0) return { error: "Valid price is required" };
  if (count < 1 || count > 50) return { error: "Quantity must be 1-50" };

  // GTIN required for footwear
  const catStr = category ?? "";
  if (isFootwear(catStr) && !gtin) return { error: "GTIN is required for footwear" };

  try {
    await submitListing({
      consignorId: consignor.id,
      title,
      brand,
      category,
      styleId,
      size,
      gtin,
      price,
      count,
      imageData,
    });
    return redirect("/portal/listings?status=submitted");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit listing" };
  }
}

type ProductResult = {
  id: string;
  styleId: string | null;
  title: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  variants: Array<{ id: string; size: string; gtin: string | null }>;
};

export default function PortalListingNew() {
  const { consignor, prefillProduct } = useLoaderData<typeof loader>();
  const parentData = useRouteLoaderData<typeof portalLoader>("routes/portal");
  const fetcher = useFetcher();
  const navigate = useNavigate();

  // Product search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductResult[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(prefillProduct ?? null);
  const [showSearch, setShowSearch] = useState(!prefillProduct);
  const [manualMode, setManualMode] = useState(false);

  // Form fields — prefill from product if coming from quick-add
  const prefillCategoryParts = prefillProduct?.category?.split(" > ") ?? [];
  const [title, setTitle] = useState(prefillProduct?.title ?? "");
  const [brand, setBrand] = useState(prefillProduct?.brand ?? "");
  const [mainCategory, setMainCategory] = useState(prefillCategoryParts[0] ?? "");
  const [subCategory, setSubCategory] = useState(prefillCategoryParts[1] ?? "");
  const [styleId, setStyleId] = useState(prefillProduct?.styleId ?? "");
  const [size, setSize] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [gtin, setGtin] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [imageData, setImageData] = useState("");
  const [newSize, setNewSize] = useState(false);

  // Validation errors
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  const clearError = (field: string) =>
    setFieldErrors((prev) => { const next = new Set(prev); next.delete(field); return next; });

  // Brand autocomplete
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);

  // Market data
  const [marketData, setMarketData] = useState<{ lowestPrice: number | null; daysSinceLastListing: number | null } | null>(null);

  const isFootwearCategory = isFootwear(mainCategory ? buildCategory(mainCategory, subCategory) : selectedProduct?.category ?? "");
  const actionData = fetcher.data as { error?: string } | undefined;

  const errorRing = (field: string) =>
    fieldErrors.has(field) ? "ring-2 ring-red-500/60 shadow-[0_0_8px_rgba(239,68,68,0.3)]" : "";

  // Auto-suggest brand + category from title (manual mode only)
  useEffect(() => {
    if (!manualMode || !title.trim()) return;
    const suggestion = autoSuggest(title);

    if (suggestion.brand && !brand) {
      setBrand(suggestion.brand);
    }
    if (suggestion.mainCategory && !mainCategory) {
      setMainCategory(suggestion.mainCategory);
      if (suggestion.subCategory) setSubCategory(suggestion.subCategory);
      // Auto-fill O/S for Accessories & Headwear
      if ((suggestion.mainCategory === "Accessories" || suggestion.mainCategory === "Headwear") && !size) {
        setSize("O/S");
      }
    }
  }, [title, manualMode]);

  // Debounced product search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/portal/api/products?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data.products ?? []);
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Debounced brand search
  useEffect(() => {
    if (!brand.trim() || brand.length < 2 || selectedProduct) {
      setBrandSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/portal/api/brands?q=${encodeURIComponent(brand)}`);
        const data = await res.json();
        setBrandSuggestions(data.brands ?? []);
      } catch { setBrandSuggestions([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [brand, selectedProduct]);

  // Fetch market data when variant selected
  useEffect(() => {
    if (!selectedVariantId) { setMarketData(null); return; }
    (async () => {
      try {
        const res = await fetch(`/portal/api/market-data?variantId=${selectedVariantId}`);
        const data = await res.json();
        setMarketData(data);
      } catch { setMarketData(null); }
    })();
  }, [selectedVariantId]);

  const handleSelectProduct = (product: ProductResult) => {
    setSelectedProduct(product);
    setTitle(product.title);
    setBrand(product.brand ?? "");
    setStyleId(product.styleId ?? "");
    if (product.category) {
      const parts = product.category.split(" > ");
      setMainCategory(parts[0] ?? "");
      setSubCategory(parts[1] ?? "");
    }
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    setSize("");
    setNewSize(false);
    setSelectedVariantId("");
    setGtin("");
  };

  const handleSelectVariant = (variant: ProductResult["variants"][0]) => {
    setSize(variant.size);
    setSelectedVariantId(variant.id);
    setGtin(variant.gtin ?? "");
    setNewSize(false);
    clearError("size");
    clearError("gtin");
  };

  const handleManualMode = () => {
    setManualMode(true);
    setShowSearch(false);
    setSelectedProduct(null);
    setTitle("");
    setBrand("");
    setMainCategory("");
    setSubCategory("");
    setStyleId("");
    setSize("");
    setGtin("");
    setSelectedVariantId("");
  };

  const handleReset = () => {
    setManualMode(false);
    setShowSearch(true);
    setSelectedProduct(null);
    setTitle("");
    setBrand("");
    setMainCategory("");
    setSubCategory("");
    setStyleId("");
    setSize("");
    setGtin("");
    setPrice("");
    setQuantity("1");
    setImageData("");
    setSelectedVariantId("");
    setNewSize(false);
    setMarketData(null);
  };

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("Image must be under 10MB"); return; }
    try {
      const processed = await processProductImage(file);
      setImageData(processed);
    } catch {
      alert("Failed to process image");
    }
  }, []);

  // Auto-fill GTIN when typed size matches an existing variant
  useEffect(() => {
    if (!selectedProduct || !newSize || !size.trim()) return;
    const match = selectedProduct.variants.find(
      (v) => v.size.toLowerCase() === size.trim().toLowerCase()
    );
    if (match?.gtin) {
      setGtin(match.gtin);
      setSelectedVariantId(match.id);
      setNewSize(false);
      clearError("gtin");
    }
  }, [size, selectedProduct, newSize]);

  const subCategories = mainCategory ? (CATEGORIES[mainCategory] ?? []) : [];

  return (
    <div>
      <AppHeader title="Submit Listing" subtitle="Submit an item for review" consignorName={consignor.name} avatarColor={parentData?.consignor?.avatarColor} notifications={parentData?.notifications} />

      <div className="px-4 md:px-8 pb-8 max-w-2xl">
        {/* Back link */}
        <button
          onClick={() => navigate("/portal/listings")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Listings
        </button>

        {actionData?.error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {actionData.error}
          </div>
        )}

        <fetcher.Form method="post" className="space-y-6" onSubmit={(e) => {
          const errors = new Set<string>();
          if (manualMode && !title.trim()) errors.add("title");
          if (!size.trim()) errors.add("size");
          if (isFootwearCategory && !gtin.trim()) errors.add("gtin");
          if (!price.trim() || isNaN(parseFloat(price)) || parseFloat(price) <= 0) errors.add("price");
          if (errors.size > 0) {
            e.preventDefault();
            setFieldErrors(errors);
            return;
          }
          setFieldErrors(new Set());
        }}>
          {/* Hidden fields for form submission */}
          <input type="hidden" name="title" value={title} />
          <input type="hidden" name="brand" value={brand} />
          <input type="hidden" name="mainCategory" value={mainCategory} />
          <input type="hidden" name="subCategory" value={subCategory} />
          <input type="hidden" name="styleId" value={styleId} />
          <input type="hidden" name="imageData" value={imageData} />

          {/* Step 1: Product Search */}
          {showSearch && (
            <div className="glass-panel rounded-2xl p-4 md:p-6 animate-slide-up space-y-4">
              <h3 className="text-sm font-semibold">Find Your Product</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by product name or style ID..."
                  className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
                  autoFocus
                />
              </div>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {searchResults.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleSelectProduct(product)}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center gap-3"
                    >
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.title}
                          className="w-9 h-9 rounded-lg object-cover border border-[rgba(255,255,255,0.08)] shrink-0"
                        />
                      ) : (
                        <span className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-muted-foreground" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{product.title}</div>
                        <div className="text-xs text-muted-foreground flex gap-2">
                          {product.brand && <span>{product.brand}</span>}
                          {product.styleId && <span>· {product.styleId}</span>}
                          <span>· {product.variants.length} size{product.variants.length !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Not found toggle */}
              <button
                type="button"
                onClick={handleManualMode}
                className="flex items-center gap-2 text-xs text-primary font-medium hover:opacity-80 transition-opacity cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                I didn't find my item — add manually
              </button>
            </div>
          )}

          {/* Selected product or manual entry */}
          {(selectedProduct || manualMode) && (
            <div className="glass-panel rounded-2xl p-4 md:p-6 animate-slide-up space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {selectedProduct ? "Product Selected" : "New Product Details"}
                </h3>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Change
                </button>
              </div>

              {/* Tips for manual entry */}
              {manualMode && (
                <div className="rounded-xl bg-primary/[0.04] border border-primary/10 px-4 py-3 flex gap-3">
                  <Lightbulb className="w-4 h-4 text-primary/60 shrink-0 mt-0.5" />
                  <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
                    <p><span className="text-foreground/80 font-medium">Product name</span> — use the exact title from StockX to keep it standardized</p>
                    <p><span className="text-foreground/80 font-medium">Style ID</span> — found on the inner tag or shoe box, helps with tracking</p>
                    <p><span className="text-foreground/80 font-medium">GTIN</span> — the barcode number on the box, type or scan it</p>
                  </div>
                </div>
              )}

              {selectedProduct ? (
                /* Product selected — show summary */
                <div className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-[rgba(255,255,255,0.08)]">
                  <div className="text-sm font-medium">{selectedProduct.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedProduct.brand && <span>{selectedProduct.brand} · </span>}
                    {selectedProduct.category && <span>{selectedProduct.category} · </span>}
                    {selectedProduct.styleId && <span>{selectedProduct.styleId}</span>}
                  </div>
                </div>
              ) : (
                /* Manual entry fields */
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Product Name</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => { setTitle(e.target.value); clearError("title"); }}
                      className={`glass-input w-full px-3 py-2.5 rounded-xl text-sm transition-shadow ${errorRing("title")}`}
                      placeholder="e.g. Nike Air Max 90"
                    />
                  </div>
                  <div className="relative">
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Brand</label>
                    <input
                      type="text"
                      value={brand}
                      onChange={(e) => { setBrand(e.target.value); setShowBrandSuggestions(true); }}
                      onBlur={() => setTimeout(() => setShowBrandSuggestions(false), 200)}
                      className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
                      placeholder="e.g. Nike"
                    />
                    {showBrandSuggestions && brandSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 glass-panel-strong rounded-xl overflow-hidden z-20 max-h-40 overflow-y-auto">
                        {brandSuggestions.map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => { setBrand(b); setShowBrandSuggestions(false); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.08] cursor-pointer"
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Category</label>
                      <GlassSelect
                        options={MAIN_CATEGORIES.map((cat) => ({ label: cat, value: cat }))}
                        value={mainCategory}
                        onChange={(v) => { setMainCategory(v); setSubCategory(""); }}
                        placeholder="Select..."
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Subcategory</label>
                      <GlassSelect
                        options={subCategories.map((sub) => ({ label: sub, value: sub }))}
                        value={subCategory}
                        onChange={setSubCategory}
                        placeholder="Select..."
                        disabled={!mainCategory}
                      />
                    </div>
                  </div>
                  {/* Photo upload */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Photo</label>
                    {imageData ? (
                      <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-[rgba(255,255,255,0.1)]">
                        <img src={imageData} alt="Product" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setImageData("")}
                          className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl glass-input cursor-pointer hover:bg-white/[0.08] transition-colors text-sm text-muted-foreground">
                        <Camera className="w-4 h-4" />
                        Upload photo
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Style ID <span className="text-muted-foreground/60 font-normal">(optional)</span></label>
                    <input
                      type="text"
                      value={styleId}
                      onChange={(e) => setStyleId(e.target.value)}
                      className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
                      placeholder="e.g. CD0881-100"
                    />
                  </div>
                </div>
              )}

              {/* Size selection */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Size</label>
                {selectedProduct && selectedProduct.variants.length > 0 && !newSize ? (
                  <div className={`space-y-2 rounded-xl p-1 -m-1 transition-shadow ${errorRing("size")}`}>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.variants.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => handleSelectVariant(v)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                            size === v.size
                              ? "bg-primary/20 text-primary border border-primary/30"
                              : "bg-white/[0.06] text-muted-foreground hover:bg-white/[0.1] border border-transparent"
                          }`}
                        >
                          {v.size}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => { setNewSize(true); setSize(""); setSelectedVariantId(""); setGtin(""); }}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium text-primary bg-primary/10 hover:bg-primary/15 transition-colors cursor-pointer border border-transparent"
                      >
                        + New size
                      </button>
                    </div>
                  </div>
                ) : (
                  <input
                    type={isFootwearCategory ? "number" : "text"}
                    name="size"
                    value={size}
                    onChange={(e) => { setSize(e.target.value); clearError("size"); }}
                    className={`glass-input w-full px-3 py-2.5 rounded-xl text-sm transition-shadow ${errorRing("size")}`}
                    placeholder={isFootwearCategory ? "e.g. 10" : "e.g. M, L, O/S"}
                    step={isFootwearCategory ? "0.5" : undefined}
                    min={isFootwearCategory ? "1" : undefined}
                    max={isFootwearCategory ? "99" : undefined}
                  />
                )}
                {!size && <input type="hidden" name="size" value="" />}
                {size && <input type="hidden" name="size" value={size} />}
              </div>

              {/* GTIN */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  GTIN / Barcode
                </label>
                <input
                  type="text"
                  name="gtin"
                  value={gtin}
                  onChange={(e) => { setGtin(e.target.value); clearError("gtin"); }}
                  className={`glass-input w-full px-3 py-2.5 rounded-xl text-sm transition-shadow ${errorRing("gtin")}`}
                  placeholder="e.g. 194500787612"
                  readOnly={!!(selectedProduct && size && !newSize && gtin)}
                />
              </div>
            </div>
          )}

          {/* Market Context */}
          {marketData && (marketData.lowestPrice !== null || marketData.daysSinceLastListing !== null) && (
            <div className="glass-panel rounded-2xl p-4 animate-slide-up">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Market Context</h3>
              <div className="flex gap-6">
                {marketData.lowestPrice !== null && (
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-[hsl(var(--success))]" />
                    <div>
                      <div className="text-sm font-bold tabular-nums">${fmt(marketData.lowestPrice)}</div>
                      <div className="text-[10px] text-muted-foreground">Lowest active price</div>
                    </div>
                  </div>
                )}
                {marketData.daysSinceLastListing !== null && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[hsl(var(--warning))]" />
                    <div>
                      <div className="text-sm font-bold tabular-nums">{marketData.daysSinceLastListing}d</div>
                      <div className="text-[10px] text-muted-foreground">Since last listing</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Price + Quantity */}
          {(selectedProduct || manualMode) && (
            <div className="glass-panel rounded-2xl p-4 md:p-6 animate-slide-up space-y-4">
              <h3 className="text-sm font-semibold">Pricing</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Ask Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      name="price"
                      value={price}
                      onChange={(e) => { setPrice(e.target.value.replace(",", ".")); clearError("price"); }}
                      className={`glass-input w-full pl-7 pr-3 py-2.5 rounded-xl text-sm transition-shadow ${errorRing("price")}`}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Quantity</label>
                  <input
                    type="number"
                    name="quantity"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
                    min="1"
                    max="50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          {(selectedProduct || manualMode) && (
            <button
              type="submit"
              disabled={fetcher.state !== "idle"}
              className="btn-cta w-full py-3 text-sm text-center"
            >
              {fetcher.state !== "idle" ? "Submitting..." : "Submit for Review"}
            </button>
          )}
        </fetcher.Form>
      </div>
    </div>
  );
}
