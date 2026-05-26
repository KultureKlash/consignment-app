import type { Listing, ProductGroup, VariantInfo } from "./types";
import { compareSizes } from "~/lib/size-order";
import { LISTING_STATUS } from "~/lib/listing-statuses";

// ── Helpers ──

/** Group the listings inside one product by their variant.id so the table can
 *  render one collapsed row per variant when there are multiple listings of
 *  the same size. Preserves the order of the input listings within each
 *  group (caller already sorted by price/whatever). */
export type VariantGroup = {
  variantId: string;
  size: string;
  gtin: string | null;
  listings: ProductGroup["listings"];
};

export function groupByVariant(listings: ProductGroup["listings"]): VariantGroup[] {
  const map = new Map<string, VariantGroup>();
  for (const l of listings) {
    const existing = map.get(l.variantId);
    if (existing) {
      existing.listings.push(l);
    } else {
      map.set(l.variantId, {
        variantId: l.variantId,
        size: l.variant.size,
        gtin: l.variant.gtin,
        listings: [l],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => compareSizes(a.size, b.size));
}

export function SortIndicator({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="text-gray-300 ml-1 text-[10px]">&#8597;</span>;
  return <span className="ml-1 text-[10px]">{dir === "asc" ? "\u2191" : "\u2193"}</span>;
}

export function groupByProduct(listings: Listing[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();
  for (const l of listings) {
    const pid = l.variant.product.id;
    let group = map.get(pid);
    if (!group) {
      group = {
        productId: pid,
        title: l.variant.product.title,
        sku: l.variant.product.sku,
        brand: l.variant.product.brand,
        category: l.variant.product.category ?? null,
        imageUrl: l.variant.product.imageUrl ?? null,
        sectionId: l.variant.product.sectionId ?? null,
        sectionName: l.variant.product.section?.name ?? null,
        variants: [],
        listings: [],
      };
      map.set(pid, group);
    }
    group.listings.push(l);
  }
  // Sort child listings by size and deduplicate variants
  for (const group of map.values()) {
    group.listings.sort((a, b) => compareSizes(a.variant.size, b.variant.size));
    const variantMap = new Map<string, VariantInfo>();
    for (const l of group.listings) {
      if (!variantMap.has(l.variant.size)) {
        variantMap.set(l.variant.size, { size: l.variant.size, gtin: l.variant.gtin });
      }
    }
    group.variants = Array.from(variantMap.values());
  }
  return Array.from(map.values());
}

const statusCountColors: Record<string, string> = {
  submitted: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  sold: "bg-purple-100 text-purple-800",
};

export function StatusCounts({ listings }: { listings: Listing[] }) {
  const submitted = listings.filter((l) => l.status === LISTING_STATUS.SUBMITTED).length;
  const approved = listings.filter((l) => l.status === LISTING_STATUS.APPROVED).length;
  const active = listings.filter((l) => l.status === LISTING_STATUS.ACTIVE).length;
  const sold = listings.filter((l) => l.status === LISTING_STATUS.SOLD).length;
  const counts = [
    { label: "submitted", count: submitted },
    { label: "approved", count: approved },
    { label: "active", count: active },
    { label: "sold", count: sold },
  ].filter((c) => c.count > 0);

  if (counts.length === 0) {
    return (
      <span className="text-[11px] text-gray-400">
        {listings.length} listing{listings.length !== 1 ? "s" : ""}
      </span>
    );
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      {counts.map((c) => {
        const colorClass = statusCountColors[c.label] ?? "bg-gray-100 text-gray-500";
        return (
          <span
            key={c.label}
            className={`inline-block px-[7px] py-px text-[11px] font-semibold rounded tracking-tight leading-[18px] ${colorClass}`}
          >
            {c.count} {c.label}
          </span>
        );
      })}
    </div>
  );
}

export function ActionBtn({ label, icon, color, bg, border, onClick, disabled }: {
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      title={label}
      style={{ color }}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md cursor-pointer transition-all duration-150 border-0 bg-transparent ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-100"
      }`}
    >
      {icon}
    </button>
  );
}
