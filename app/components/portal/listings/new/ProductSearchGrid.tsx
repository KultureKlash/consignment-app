import { Search, Plus, Package } from "lucide-react";
import type { ProductResult } from "./NewListingPage";

interface ProductSearchGridProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResults: ProductResult[];
  onSelectProduct: (product: ProductResult) => void;
  onManualMode: () => void;
  scrollSentinelRef: React.RefObject<HTMLDivElement | null>;
}

export function ProductSearchGrid({
  searchQuery,
  onSearchChange,
  searchResults,
  onSelectProduct,
  onManualMode,
  scrollSentinelRef,
}: ProductSearchGridProps) {
  return (
    <div className="animate-slide-up space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/60 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by product name or SKU"
            className="glass-input w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
            autoFocus
          />
        </div>
        <button
          type="button"
          onClick={onManualMode}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-primary bg-white/[0.06] border border-[rgba(255,255,255,0.08)] hover:bg-white/[0.1] transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add manually
        </button>
      </div>

      {/* Search results — card grid */}
      {searchResults.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          {searchResults.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onSelectProduct(product)}
              className="text-left rounded-2xl overflow-hidden bg-white/[0.04] border border-[rgba(255,255,255,0.06)] hover:bg-white/[0.08] hover:border-[rgba(255,255,255,0.12)] transition-all cursor-pointer group"
            >
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.title}
                  className="w-full aspect-square object-cover group-hover:scale-[1.02] transition-transform duration-200"
                />
              ) : (
                <div className="w-full aspect-square bg-white/[0.03] flex items-center justify-center">
                  <Package className="w-10 h-10 text-muted-foreground/40" />
                </div>
              )}
              <div className="p-3">
                <div className="text-sm font-medium leading-tight line-clamp-2">{product.title}</div>
                <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
                  {product.brand && <span>{product.brand}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {searchQuery.trim().length >= 2 && searchResults.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No products found for &quot;{searchQuery}&quot;
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={scrollSentinelRef} className="h-1" />
    </div>
  );
}
