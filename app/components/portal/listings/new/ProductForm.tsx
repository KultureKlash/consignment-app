import { Lightbulb, TrendingDown, Clock } from "lucide-react";
import { GlassSelect } from "~/components/portal/GlassSelect";
import { CATEGORIES, MAIN_CATEGORIES } from "~/lib/categories";
import { compareSizes } from "~/lib/size-order";
import { fmt } from "~/lib/currency";
import type { ProductResult } from "./NewListingPage";

interface ProductFormProps {
  selectedProduct: ProductResult | null;
  manualMode: boolean;
  // Product details
  title: string;
  onTitleChange: (v: string) => void;
  brand: string;
  onBrandChange: (v: string) => void;
  brandSuggestions: string[];
  showBrandSuggestions: boolean;
  onShowBrandSuggestions: (v: boolean) => void;
  onSelectBrand: (b: string) => void;
  mainCategory: string;
  onMainCategoryChange: (v: string) => void;
  subCategory: string;
  onSubCategoryChange: (v: string) => void;
  sku: string;
  onSkuChange: (v: string) => void;
  // Size
  size: string;
  onSizeChange: (v: string) => void;
  newSize: boolean;
  onNewSize: () => void;
  onSelectVariant: (variant: ProductResult["variants"][0]) => void;
  // GTIN
  gtin: string;
  onGtinChange: (v: string) => void;
  isFootwearCategory: boolean;
  // Market data
  marketData: { lowestPrice: number | null; daysSinceLastSale: number | null } | null;
  // Pricing
  price: string;
  onPriceChange: (v: string) => void;
  onPriceBlur: () => void;
  onPriceFocus: () => void;
  quantity: string;
  onQuantityChange: (v: string) => void;
  // Reset + errors
  onReset: () => void;
  fieldErrors: Set<string>;
  clearError: (field: string) => void;
  // Submit state
  isSubmitting: boolean;
}

export function ProductForm({
  selectedProduct,
  manualMode,
  title,
  onTitleChange,
  brand,
  onBrandChange,
  brandSuggestions,
  showBrandSuggestions,
  onShowBrandSuggestions,
  onSelectBrand,
  mainCategory,
  onMainCategoryChange,
  subCategory,
  onSubCategoryChange,
  sku,
  onSkuChange,
  size,
  onSizeChange,
  newSize,
  onNewSize,
  onSelectVariant,
  gtin,
  onGtinChange,
  isFootwearCategory,
  marketData,
  price,
  onPriceChange,
  onPriceBlur,
  onPriceFocus,
  quantity,
  onQuantityChange,
  onReset,
  fieldErrors,
  clearError,
  isSubmitting,
}: ProductFormProps) {
  const errorRing = (field: string) =>
    fieldErrors.has(field) ? "ring-2 ring-red-500/60 shadow-[0_0_8px_rgba(239,68,68,0.3)]" : "";

  const subCategories = mainCategory ? (CATEGORIES[mainCategory] ?? []) : [];

  return (
    <>
      {/* Product details panel */}
      <div className="glass-panel rounded-2xl p-4 md:p-6 animate-slide-up space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {selectedProduct ? "Product Selected" : "New Product Details"}
          </h3>
          <button
            type="button"
            onClick={onReset}
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
              <p><span className="text-foreground/80 font-medium">SKU</span> — found on the inner tag or shoe box, helps with tracking</p>
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
              {selectedProduct.sku && <span>{selectedProduct.sku}</span>}
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
                onChange={(e) => { onTitleChange(e.target.value); clearError("title"); }}
                className={`glass-input w-full px-3 py-2.5 rounded-xl text-sm transition-shadow ${errorRing("title")}`}
                placeholder="e.g. Nike Air Max 90"
              />
            </div>
            <div className="relative">
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Brand</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => { onBrandChange(e.target.value); onShowBrandSuggestions(true); }}
                onBlur={() => setTimeout(() => onShowBrandSuggestions(false), 200)}
                className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
                placeholder="e.g. Nike"
              />
              {showBrandSuggestions && brandSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 glass-panel-strong rounded-xl overflow-hidden z-20 max-h-40 overflow-y-auto">
                  {brandSuggestions.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => onSelectBrand(b)}
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
                  onChange={(v) => { onMainCategoryChange(v); onSubCategoryChange(""); }}
                  placeholder="Select..."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Subcategory</label>
                <GlassSelect
                  options={subCategories.map((sub) => ({ label: sub, value: sub }))}
                  value={subCategory}
                  onChange={onSubCategoryChange}
                  placeholder="Select..."
                  disabled={!mainCategory}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">SKU <span className="text-muted-foreground/60 font-normal">(optional)</span></label>
              <input
                type="text"
                value={sku}
                onChange={(e) => onSkuChange(e.target.value)}
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
                {[...selectedProduct.variants].sort((a, b) => compareSizes(a.size, b.size)).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onSelectVariant(v)}
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
                  onClick={onNewSize}
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
              onChange={(e) => { onSizeChange(e.target.value); clearError("size"); }}
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

        {/* GTIN — only shown for footwear; non-footwear gets auto-generated */}
        {isFootwearCategory ? (
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              GTIN / Barcode
            </label>
            <input
              type="text"
              name="gtin"
              value={gtin}
              onChange={(e) => { onGtinChange(e.target.value); clearError("gtin"); }}
              className={`glass-input w-full px-3 py-2.5 rounded-xl text-sm transition-shadow ${errorRing("gtin")}`}
              placeholder="e.g. 194500787612"
              readOnly={!!(selectedProduct && size && !newSize && gtin)}
            />
          </div>
        ) : (
          <div className="flex items-center pt-6">
            <p className="text-xs text-muted-foreground">Barcode will be auto-generated.</p>
          </div>
        )}
      </div>

      {/* Market Context */}
      {marketData && (marketData.lowestPrice !== null || marketData.daysSinceLastSale !== null) && (
        <div className="glass-panel rounded-2xl p-4 animate-slide-up">
          <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Market Context</h3>
          <div className="flex gap-6">
            {marketData.lowestPrice !== null && (
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-[hsl(var(--success))]" />
                <div>
                  <div className="text-sm font-bold tabular-nums">${fmt(marketData.lowestPrice)}</div>
                  <div className="text-[10px] text-muted-foreground">Lowest ask</div>
                </div>
              </div>
            )}
            {marketData.daysSinceLastSale !== null && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[hsl(var(--warning))]" />
                <div>
                  <div className="text-sm font-bold tabular-nums">{marketData.daysSinceLastSale}d</div>
                  <div className="text-[10px] text-muted-foreground">Last sold</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Price + Quantity */}
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
                onChange={(e) => { onPriceChange(e.target.value.replace(/[^0-9.]/g, "")); clearError("price"); }}
                onBlur={onPriceBlur}
                onFocus={onPriceFocus}
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
              onChange={(e) => onQuantityChange(e.target.value)}
              className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
              min="1"
              max="50"
            />
          </div>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="btn-cta w-full py-3 text-sm text-center"
      >
        {isSubmitting ? "Submitting..." : "Submit for Review"}
      </button>
    </>
  );
}
