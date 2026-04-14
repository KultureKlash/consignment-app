import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, MapPin } from "lucide-react";
import { CATEGORIES, MAIN_CATEGORIES, parseCategory } from "~/lib/categories";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { inputStyle, searchInputStyle, searchIconWrap, handleFocus, handleBlurStyle } from "~/lib/admin/listing-ui";
import CustomSelect from "~/components/admin/CustomSelect";

type Consignor = { id: string; name: string };

type Section = { id: string; name: string };

type Props = {
  search: string;
  status: string;
  category: string;
  consignorId: string;
  sectionId?: string;
  consignors: Consignor[];
  sections?: Section[];
  onFilterChange: (params: Record<string, string>) => void;
};

const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Submitted", value: LISTING_STATUS.SUBMITTED },
  { label: "Awaiting Drop-off", value: LISTING_STATUS.APPROVED },
  { label: "Active", value: LISTING_STATUS.ACTIVE },
  { label: "Paused", value: LISTING_STATUS.PAUSED },
  { label: "Pending Sale", value: LISTING_STATUS.PENDING_SALE },
  { label: "Sold", value: LISTING_STATUS.SOLD },
  { label: "Rejected", value: LISTING_STATUS.REJECTED },
  { label: "Cancelled", value: LISTING_STATUS.CANCELLED },
  { label: "Withdrawal", value: LISTING_STATUS.WITHDRAWAL_REQUESTED },
  { label: "Pickup", value: LISTING_STATUS.PENDING_PICKUP },
  { label: "Withdrawn", value: LISTING_STATUS.WITHDRAWN },
];

export default function ListingsFilter({
  search: initialSearch,
  status,
  category,
  consignorId,
  sectionId = "",
  consignors,
  sections = [],
  onFilterChange,
}: Props) {
  const [searchValue, setSearchValue] = useState(initialSearch);

  // Sync external search prop
  useEffect(() => {
    setSearchValue(initialSearch);
  }, [initialSearch]);

  // Debounced search
  useEffect(() => {
    if (searchValue === initialSearch) return;
    const timer = setTimeout(() => {
      onFilterChange({ search: searchValue, page: "1" });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchValue]);

  // Derive main/sub from category param (e.g. "Sneakers" or legacy "Footwear > Sneakers")
  const categoryParsed = category ? parseCategory(category) : { main: "", sub: undefined };
  const mainCategory = categoryParsed.main || "";
  const subCategory = categoryParsed.sub || "";
  const subOptions = mainCategory ? (CATEGORIES[mainCategory] ?? []) : [];

  const hasFilters = (status && status !== "active") || category || consignorId || sectionId || initialSearch;

  const consignorNames = consignors.map((c) => c.name);
  const selectedConsignorName = consignors.find((c) => c.id === consignorId)?.name ?? "";

  const chipBase: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: "6px",
    padding: "7px 14px", fontSize: "12px", fontWeight: 500,
    borderRadius: "20px", cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.2s ease", border: "1px solid #e8e8e8",
    background: "#fafafa", color: "#6b7280", whiteSpace: "nowrap",
  };
  const chipActive: React.CSSProperties = {
    ...chipBase,
    background: "#111827", color: "#fff", border: "1px solid #111827",
    boxShadow: "0 2px 8px rgba(17,24,39,0.15)",
  };

  return (
    <div style={{ marginBottom: "16px" }}>
      {/* Search */}
      <div style={{ position: "relative", marginBottom: "10px" }}>
        <span style={searchIconWrap}><Search size={16} /></span>
        <input
          type="text"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlurStyle}
          placeholder="Search by product, style ID, or consignor..."
          style={{ ...searchInputStyle, borderRadius: "12px", padding: "11px 14px 11px 38px" }}
        />
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
        <CustomSelect
          options={STATUS_OPTIONS}
          value={status}
          onChange={(val) => onFilterChange({ status: val === status ? "all" : val, page: "1" })}
          placeholder="Status"
          chipStyle={status && status !== "active" ? chipActive : chipBase}
        />

        <CustomSelect
          options={MAIN_CATEGORIES}
          value={mainCategory}
          onChange={(val) => onFilterChange({ category: val === mainCategory ? "" : val, page: "1" })}
          placeholder="Category"
          chipStyle={mainCategory ? chipActive : chipBase}
        />

        {mainCategory && subOptions.length > 0 && (
          <CustomSelect
            options={subOptions}
            value={subCategory}
            onChange={(val) => {
              if (val === subCategory) {
                onFilterChange({ category: mainCategory, page: "1" });
              } else {
                onFilterChange({ category: val, page: "1" });
              }
            }}
            placeholder="Subcategory"
            searchable
            chipStyle={subCategory ? chipActive : chipBase}
          />
        )}

        <CustomSelect
          options={consignorNames}
          value={selectedConsignorName}
          onChange={(val) => {
            const c = consignors.find((c) => c.name === val);
            onFilterChange({
              consignorId: c && c.id !== consignorId ? c.id : "",
              page: "1",
            });
          }}
          placeholder="Consignor"
          searchable
          chipStyle={consignorId ? chipActive : chipBase}
        />

        {sections.length > 0 && (
          <SectionFilterPicker
            sections={sections}
            value={sectionId}
            onChange={(val) => onFilterChange({ sectionId: val, page: "1" })}
            chipBase={chipBase}
            chipActive={chipActive}
          />
        )}

        {hasFilters && (
          <button
            onClick={() => {
              setSearchValue("");
              onFilterChange({ search: "", status: "active", category: "", consignorId: "", sectionId: "", page: "1" });
            }}
            style={{
              ...chipBase,
              color: "#dc2626",
              border: "1px solid rgba(220,38,38,0.2)",
              background: "rgba(220,38,38,0.04)",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "14px", lineHeight: 1 }}>×</span>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// ── Section filter with grouped pill layout ──

function SectionFilterPicker({ sections, value, onChange, chipBase, chipActive }: {
  sections: Section[];
  value: string;
  onChange: (val: string) => void;
  chipBase: React.CSSProperties;
  chipActive: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const selectedName = sections.find((s) => s.id === value)?.name ?? null;
  const q = search.toLowerCase();
  const racks = sections.filter((s) => s.name.startsWith("Rack ") && (!q || s.name.toLowerCase().includes(q)));
  const shelves = sections.filter((s) => /^[A-Z]\d+$/.test(s.name) && (!q || s.name.toLowerCase().includes(q)));
  const other = sections.filter((s) => !s.name.startsWith("Rack ") && !/^[A-Z]\d+$/.test(s.name) && (!q || s.name.toLowerCase().includes(q)));

  const pick = (id: string) => { onChange(id); setOpen(false); setSearch(""); };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        style={value ? { ...chipActive, gap: "5px" } : { ...chipBase, gap: "5px" }}
      >
        <MapPin size={11} />
        {selectedName ?? "Section"}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div ref={popoverRef} style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
          background: "#fff", border: "1px solid #f0f0f0", borderRadius: "12px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)", width: "240px",
          display: "flex", flexDirection: "column", maxHeight: "300px",
        }}>
          <div style={{ padding: "8px", borderBottom: "1px solid #f5f5f5", flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sections..."
                style={{ width: "100%", padding: "6px 8px 6px 28px", fontSize: "12px", border: "1px solid #e5e7eb", borderRadius: "8px", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>
          </div>
          <div style={{ overflowY: "auto", scrollbarWidth: "none", flex: 1, padding: "4px 0" }}>
            {value && (
              <div onClick={() => pick("")} style={{ padding: "6px 12px", fontSize: "11px", color: "#9ca3af", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
              >Clear section</div>
            )}
            {racks.length > 0 && (
              <>
                <div style={{ padding: "6px 12px 4px", fontSize: "9px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Clothing Racks</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", padding: "2px 10px 8px" }}>
                  {racks.map((s) => (
                    <button key={s.id} onClick={() => pick(s.id)} style={{
                      padding: "4px 10px", fontSize: "11px", fontWeight: 600, borderRadius: "6px", fontFamily: "inherit",
                      border: `1px solid ${s.id === value ? "#059669" : "#e5e7eb"}`,
                      background: s.id === value ? "#ecfdf5" : "#fff",
                      color: s.id === value ? "#059669" : "#374151", cursor: "pointer",
                    }}>{s.name}</button>
                  ))}
                </div>
              </>
            )}
            {shelves.length > 0 && (
              <>
                <div style={{ padding: "6px 12px 4px", fontSize: "9px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Shoe Storage</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "3px", padding: "2px 10px 8px" }}>
                  {shelves.map((s) => (
                    <button key={s.id} onClick={() => pick(s.id)} style={{
                      padding: "4px 0", fontSize: "11px", fontWeight: 500, borderRadius: "4px", textAlign: "center", fontFamily: "inherit",
                      border: `1px solid ${s.id === value ? "#059669" : "#f3f4f6"}`,
                      background: s.id === value ? "#ecfdf5" : "#f9fafb",
                      color: s.id === value ? "#059669" : "#6b7280", cursor: "pointer",
                    }}>{s.name}</button>
                  ))}
                </div>
              </>
            )}
            {other.map((s) => (
              <div key={s.id} onClick={() => pick(s.id)} style={{
                padding: "6px 12px", fontSize: "12px", cursor: "pointer", fontWeight: s.id === value ? 600 : 400,
                color: s.id === value ? "#059669" : "#374151", background: s.id === value ? "#ecfdf5" : "",
              }}
                onMouseEnter={(e) => { if (s.id !== value) e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={(e) => { if (s.id !== value) e.currentTarget.style.background = ""; }}
              >{s.name}</div>
            ))}
            {racks.length === 0 && shelves.length === 0 && other.length === 0 && (
              <div style={{ padding: "12px", fontSize: "12px", color: "#9ca3af", textAlign: "center" }}>No sections match</div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
