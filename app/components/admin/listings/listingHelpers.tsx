import type { Listing, ProductGroup, VariantInfo, SortKey } from "./types";
import { compareSizes } from "~/lib/size-order";
import { LISTING_STATUS } from "~/lib/listing-statuses";

// ── Tailwind class strings ──

export const sortableThClass = "admin-th cursor-pointer select-none";
export const tableClass = "w-full border-collapse";
export const flatRowClass = "border-b border-gray-100 transition-colors duration-100 hover:bg-gray-50";

// ── Grouped view classes ──

export const groupHeaderClass = "cursor-pointer select-none border-b border-gray-200 bg-white transition-colors duration-150 hover:bg-gray-50";
export const groupHeaderCellClass = "py-3 px-3 pl-2";
export const chevronWrapClass = "inline-flex items-center justify-center w-6 h-6 mr-2.5 rounded-md transition-all duration-200 text-gray-500 shrink-0";
export const qtyBadgeClass = "inline-block px-2.5 py-0.5 text-xs font-semibold rounded-md bg-gray-100 text-gray-500 tracking-tight";
export const childRowClass = "border-b border-gray-100 bg-white transition-colors duration-150 hover:bg-gray-50";
export const childIndentTdClass = "admin-td pl-[42px]";
export const childHeaderClass = "border-b border-gray-200 bg-white";
export const childThClass = "py-[7px] px-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-left";
export const childSortableThClass = "py-[7px] px-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-left cursor-pointer select-none";
export const sizeBadgeClass = "inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 text-xs font-semibold rounded-[5px] bg-gray-100 text-gray-700 tracking-tight";
export const priceCellClass = "admin-td font-bold text-[13.5px] tabular-nums text-gray-900";
export const consignorNameClass = "text-[13px] font-medium text-gray-900 leading-tight";
export const consignorEmailClass = "text-[11px] text-gray-400 mt-px leading-tight";
export const dateCellClass = "admin-td text-xs text-gray-400 tabular-nums";
export const checkboxClass = "w-4 h-4 cursor-pointer accent-gray-900";
export const checkboxThClass = "admin-th w-9 pr-0";
export const checkboxTdClass = "admin-td w-9 pr-0";

// ── Helpers ──

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
      style={{ color, background: bg, borderColor: border }}
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md border cursor-pointer font-[inherit] transition-all duration-150 ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:opacity-80"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
