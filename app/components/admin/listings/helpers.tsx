import type { Listing, ProductGroup, VariantInfo, SortKey } from "./types";
import { thStyle, tdStyle } from "~/lib/admin/listing-ui";
import { compareSizes } from "~/lib/size-order";

// ── Shared styles ──

export const sortableThStyle: React.CSSProperties = {
  ...thStyle,
  cursor: "pointer",
  userSelect: "none",
};

export const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  borderSpacing: 0,
};

export const flatRowStyle: React.CSSProperties = {
  borderBottom: "1px solid #f0f0f0",
  transition: "background 0.12s ease-out",
};

// ── Grouped view styles ──

export const groupHeaderStyle: React.CSSProperties = {
  cursor: "pointer",
  userSelect: "none",
  borderBottom: "1px solid #e2e5ea",
  background: "#ffffff",
  transition: "background 0.15s ease-out",
};

export const groupHeaderCellStyle: React.CSSProperties = {
  padding: "12px 12px 12px 8px",
};

export const chevronWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "24px",
  height: "24px",
  marginRight: "10px",
  borderRadius: "6px",
  transition: "transform 0.2s ease-out, background 0.15s ease-out",
  color: "#6d7175",
  flexShrink: 0,
};

export const qtyBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 10px",
  fontSize: "12px",
  fontWeight: 600,
  borderRadius: "6px",
  background: "#f0f0f2",
  color: "#6d7175",
  letterSpacing: "0.01em",
};

export const childRowStyle: React.CSSProperties = {
  borderBottom: "1px solid #f0f1f3",
  background: "#ffffff",
  transition: "background 0.15s ease-out",
};

export const childIndentTd: React.CSSProperties = {
  ...tdStyle,
  paddingLeft: "42px",
};

export const childHeaderStyle: React.CSSProperties = {
  borderBottom: "1px solid #e8eaed",
  background: "#ffffff",
};

export const childThStyle: React.CSSProperties = {
  padding: "7px 8px",
  fontSize: "10px",
  fontWeight: 700,
  color: "#8c9196",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  textAlign: "left" as const,
};

export const childSortableThStyle: React.CSSProperties = {
  ...childThStyle,
  cursor: "pointer",
  userSelect: "none",
};

export const sizeBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "32px",
  padding: "2px 8px",
  fontSize: "12px",
  fontWeight: 600,
  borderRadius: "5px",
  background: "#eef0f3",
  color: "#374151",
  letterSpacing: "0.01em",
};

export const priceCellStyle: React.CSSProperties = {
  ...tdStyle,
  fontWeight: 700,
  fontSize: "13.5px",
  fontVariantNumeric: "tabular-nums",
  color: "#111827",
};

export const consignorNameStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  color: "#1a1a1a",
  lineHeight: 1.3,
};

export const consignorEmailStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#9ca3af",
  marginTop: "1px",
  lineHeight: 1.3,
};

export const dateCellStyle: React.CSSProperties = {
  ...tdStyle,
  fontSize: "12px",
  color: "#9ca3af",
  fontVariantNumeric: "tabular-nums",
};

export const checkboxStyle: React.CSSProperties = {
  width: "16px",
  height: "16px",
  cursor: "pointer",
  accentColor: "#111827",
};

export const checkboxThStyle: React.CSSProperties = {
  ...thStyle,
  width: "36px",
  paddingRight: "0",
};

export const checkboxTdStyle: React.CSSProperties = {
  ...tdStyle,
  width: "36px",
  paddingRight: "0",
};

export const editInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: "13px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box" as const,
  transition: "border-color 0.15s, box-shadow 0.15s",
};

export const editLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 600,
  color: "#6d7175",
  marginBottom: "4px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.03em",
};

// ── Helpers ──

export function SortIndicator({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span style={{ color: "#d1d5db", marginLeft: "4px", fontSize: "10px" }}>&#8597;</span>;
  return <span style={{ marginLeft: "4px", fontSize: "10px" }}>{dir === "asc" ? "\u2191" : "\u2193"}</span>;
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
        styleId: l.variant.product.styleId,
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

const statusCountColors: Record<string, { bg: string; color: string }> = {
  submitted: { bg: "#fef3c7", color: "#92400e" },
  approved: { bg: "#dbeafe", color: "#1e40af" },
  active: { bg: "#d1fae5", color: "#065f46" },
  sold: { bg: "#f3e8ff", color: "#6b21a8" },
};

export function StatusCounts({ listings }: { listings: Listing[] }) {
  const submitted = listings.filter((l) => l.status === "submitted").length;
  const approved = listings.filter((l) => l.status === "approved_awaiting_dropoff").length;
  const active = listings.filter((l) => l.status === "active").length;
  const sold = listings.filter((l) => l.status === "sold").length;
  const counts = [
    { label: "submitted", count: submitted },
    { label: "approved", count: approved },
    { label: "active", count: active },
    { label: "sold", count: sold },
  ].filter((c) => c.count > 0);

  if (counts.length === 0) {
    return (
      <span style={{ fontSize: "11px", color: "#9ca3af" }}>
        {listings.length} listing{listings.length !== 1 ? "s" : ""}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
      {counts.map((c) => {
        const colors = statusCountColors[c.label] ?? { bg: "#f3f4f6", color: "#6b7280" };
        return (
          <span
            key={c.label}
            style={{
              display: "inline-block",
              padding: "1px 7px",
              fontSize: "11px",
              fontWeight: 600,
              borderRadius: "4px",
              background: colors.bg,
              color: colors.color,
              lineHeight: "18px",
              letterSpacing: "0.01em",
            }}
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
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px 10px",
        fontSize: "11px",
        fontWeight: 600,
        borderRadius: "6px",
        border: `1px solid ${border}`,
        background: bg,
        color,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s ease",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.opacity = "0.8"; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.opacity = "1"; } }}
    >
      {icon}
      {label}
    </button>
  );
}
