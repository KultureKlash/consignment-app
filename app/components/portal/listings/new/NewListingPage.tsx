import { useState, useEffect, useRef } from "react";
import { useRouteLoaderData, useFetcher, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { isFootwear, buildCategory, parseCategory, autoSuggest } from "~/lib/categories";
import { AppHeader } from "~/components/portal/AppHeader";
import { ProductSearchGrid } from "./ProductSearchGrid";
import { ProductForm } from "./ProductForm";
import { DuplicateMatchModal } from "./DuplicateMatchModal";
import type { DuplicateMatch } from "~/services/catalog";
import type { loader as portalLoader } from "~/routes/portal";

export type ProductResult = {
  id: string;
  sku: string | null;
  title: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  variants: Array<{ id: string; size: string; gtin: string | null }>;
};

type NewListingPageProps = {
  consignor: { id: string; name: string };
  prefillProduct: ProductResult | null;
};

export function NewListingPage({ consignor, prefillProduct }: NewListingPageProps) {
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
  const prefillCat = prefillProduct?.category ? parseCategory(prefillProduct.category) : null;
  const [title, setTitle] = useState(prefillProduct?.title ?? "");
  const [brand, setBrand] = useState(prefillProduct?.brand ?? "");
  const [mainCategory, setMainCategory] = useState(prefillCat?.main ?? "");
  const [subCategory, setSubCategory] = useState(prefillCat?.sub ?? "");
  const [sku, setSku] = useState(prefillProduct?.sku ?? "");
  const [size, setSize] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [gtin, setGtin] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [imageData, setImageData] = useState<string | undefined>();
  const [newSize, setNewSize] = useState(false);

  // Validation errors
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  const clearError = (field: string) =>
    setFieldErrors((prev) => { const next = new Set(prev); next.delete(field); return next; });

  // Brand autocomplete
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);

  // Market data
  const [marketData, setMarketData] = useState<{ lowestPrice: number | null; daysSinceLastSale: number | null } | null>(null);

  const isFootwearCategory = isFootwear(mainCategory ? buildCategory(mainCategory, subCategory) : selectedProduct?.category ?? "");
  const actionData = fetcher.data as
    | { error?: string; duplicate?: DuplicateMatch }
    | undefined;
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false);
  const duplicateMatch =
    actionData?.error === "duplicate-product" && !dismissedDuplicate
      ? actionData.duplicate ?? null
      : null;
  const isSubmitting = fetcher.state !== "idle";

  // Reopen the modal if a new duplicate response arrives.
  useEffect(() => {
    if (actionData?.error === "duplicate-product") setDismissedDuplicate(false);
  }, [actionData]);

  const buildResubmitFormData = () => {
    const fd = new FormData();
    fd.set("title", title);
    fd.set("brand", brand);
    fd.set("mainCategory", mainCategory);
    fd.set("subCategory", subCategory);
    fd.set("sku", sku);
    fd.set("size", size);
    fd.set("gtin", gtin);
    fd.set("price", price);
    fd.set("quantity", quantity);
    if (imageData) fd.set("imageData", imageData);
    return fd;
  };

  const handleUseExisting = (productId: string) => {
    const fd = buildResubmitFormData();
    fd.set("useExistingProductId", productId);
    fetcher.submit(fd, { method: "POST" });
  };

  const handleForceCreate = () => {
    const fd = buildResubmitFormData();
    fd.set("forceCreate", "1");
    fetcher.submit(fd, { method: "POST" });
  };

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

  // Debounced product search with pagination
  const searchPageRef = useRef(1);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const scrollSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      searchPageRef.current = 1;
      hasMoreRef.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        searchPageRef.current = 1;
        const res = await fetch(`/portal/api/products?q=${encodeURIComponent(searchQuery)}&page=1`);
        const data = await res.json();
        setSearchResults(data.products ?? []);
        hasMoreRef.current = data.hasMore ?? false;
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Infinite scroll — load more products when sentinel is visible
  useEffect(() => {
    const el = scrollSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMoreRef.current && !loadingMoreRef.current && searchQuery.trim()) {
        loadingMoreRef.current = true;
        searchPageRef.current++;
        fetch(`/portal/api/products?q=${encodeURIComponent(searchQuery)}&page=${searchPageRef.current}`)
          .then((r) => r.json())
          .then((data) => {
            setSearchResults((prev) => [...prev, ...(data.products ?? [])]);
            hasMoreRef.current = data.hasMore ?? false;
            loadingMoreRef.current = false;
          })
          .catch(() => { loadingMoreRef.current = false; });
      }
    }, { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
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
    setSku(product.sku ?? "");
    if (product.category) {
      const cat = parseCategory(product.category);
      setMainCategory(cat.main ?? "");
      setSubCategory(cat.sub ?? "");
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
    setSku("");
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
    setSku("");
    setSize("");
    setGtin("");
    setPrice("");
    setQuantity("1");
    setSelectedVariantId("");
    setNewSize(false);
    setImageData(undefined);
    setMarketData(null);
  };

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

  return (
    <div>
      <AppHeader title="Submit Listing" subtitle="Submit an item for review" consignorName={consignor.name} avatarColor={parentData?.consignor?.avatarColor} notifications={parentData?.notifications} />

      <div className={`px-4 md:px-8 pb-8 ${showSearch ? "" : "max-w-2xl"}`}>
        {/* Back link */}
        <button
          onClick={() => navigate("/portal/listings")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Listings
        </button>

        {actionData?.error && actionData.error !== "duplicate-product" && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {actionData.error}
          </div>
        )}

        <fetcher.Form method="post" className="space-y-6" onSubmit={(e) => {
          const errors = new Set<string>();
          if (manualMode && !title.trim()) errors.add("title");
          if (!size.trim()) errors.add("size");
          if (isFootwearCategory && !gtin.trim()) errors.add("gtin");
          const rawPrice = parseFloat(price.replace(/,/g, ""));
          if (!price.trim() || isNaN(rawPrice) || rawPrice <= 0) errors.add("price");
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
          <input type="hidden" name="sku" value={sku} />
          {imageData && <input type="hidden" name="imageData" value={imageData} />}
          {/* When the consignor explicitly picked an existing product (either via
              search results or the "Add another" + button), attach to it
              directly — skips dedup, which would otherwise fire a "this product
              already exists" modal on something the user just confirmed. */}
          {selectedProduct && <input type="hidden" name="useExistingProductId" value={selectedProduct.id} />}

          {/* Step 1: Product Search — full page card grid */}
          {showSearch && (
            <ProductSearchGrid
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searchResults={searchResults}
              onSelectProduct={handleSelectProduct}
              onManualMode={handleManualMode}
              scrollSentinelRef={scrollSentinelRef}
            />
          )}

          {/* Selected product or manual entry */}
          {(selectedProduct || manualMode) && (
            <ProductForm
              selectedProduct={selectedProduct}
              manualMode={manualMode}
              title={title}
              onTitleChange={setTitle}
              brand={brand}
              onBrandChange={setBrand}
              brandSuggestions={brandSuggestions}
              showBrandSuggestions={showBrandSuggestions}
              onShowBrandSuggestions={setShowBrandSuggestions}
              onSelectBrand={(b) => { setBrand(b); setShowBrandSuggestions(false); }}
              mainCategory={mainCategory}
              onMainCategoryChange={setMainCategory}
              subCategory={subCategory}
              onSubCategoryChange={setSubCategory}
              sku={sku}
              onSkuChange={setSku}
              size={size}
              onSizeChange={setSize}
              newSize={newSize}
              onNewSize={() => { setNewSize(true); setSize(""); setSelectedVariantId(""); setGtin(""); }}
              onSelectVariant={handleSelectVariant}
              gtin={gtin}
              onGtinChange={setGtin}
              isFootwearCategory={isFootwearCategory}
              marketData={marketData}
              price={price}
              onPriceChange={setPrice}
              onPriceBlur={() => {
                const num = parseFloat(price);
                if (!isNaN(num) && num > 0) setPrice(num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
              }}
              onPriceFocus={() => {
                const num = parseFloat(price.replace(/,/g, ""));
                if (!isNaN(num)) setPrice(String(num));
              }}
              quantity={quantity}
              onQuantityChange={setQuantity}
              imageData={imageData}
              onImageChange={setImageData}
              onReset={handleReset}
              fieldErrors={fieldErrors}
              clearError={clearError}
              isSubmitting={fetcher.state !== "idle"}
            />
          )}
        </fetcher.Form>
      </div>
      {duplicateMatch && (
        <DuplicateMatchModal
          match={duplicateMatch}
          isSubmitting={isSubmitting}
          onUseExisting={handleUseExisting}
          onForceCreate={handleForceCreate}
          onCancel={() => setDismissedDuplicate(true)}
        />
      )}
    </div>
  );
}
