import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, MapPin } from "lucide-react";
import { CATEGORIES, MAIN_CATEGORIES, parseCategory } from "~/lib/categories";
import { LISTING_STATUS } from "~/lib/listing-statuses";
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

  return (
    <div className="mb-4">
      {/* Search */}
      <div className="relative mb-2.5">
        <span className="admin-search-icon"><Search size={16} /></span>
        <input
          type="text"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Search by product, SKU, or consignor..."
          className="admin-input-search rounded-xl py-2.5 pl-9 pr-3.5"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <CustomSelect
          options={STATUS_OPTIONS}
          value={status}
          onChange={(val) => onFilterChange({ status: val, page: "1" })}
          placeholder="Status"
          chipMode
          chipActive={!!(status && status !== "active")}
          onClear={() => onFilterChange({ status: "active", page: "1" })}
        />

        <CustomSelect
          options={MAIN_CATEGORIES}
          value={mainCategory}
          onChange={(val) => onFilterChange({ category: val, page: "1" })}
          placeholder="Category"
          chipMode
          chipActive={!!mainCategory}
          onClear={() => onFilterChange({ category: "", page: "1" })}
        />

        {mainCategory && subOptions.length > 0 && (
          <CustomSelect
            options={subOptions}
            value={subCategory}
            onChange={(val) => onFilterChange({ category: val, page: "1" })}
            placeholder="Subcategory"
            searchable
            chipMode
            chipActive={!!subCategory}
            onClear={() => onFilterChange({ category: mainCategory, page: "1" })}
          />
        )}

        <CustomSelect
          options={consignorNames}
          value={selectedConsignorName}
          onChange={(val) => {
            const c = consignors.find((c) => c.name === val);
            if (c) onFilterChange({ consignorId: c.id, page: "1" });
          }}
          placeholder="Consignor"
          searchable
          chipMode
          chipActive={!!consignorId}
          onClear={() => onFilterChange({ consignorId: "", page: "1" })}
        />

        {sections.length > 0 && (
          <SectionFilterPicker
            sections={sections}
            value={sectionId}
            onChange={(val) => onFilterChange({ sectionId: val, page: "1" })}
          />
        )}

        {hasFilters && (
          <button
            onClick={() => {
              setSearchValue("");
              onFilterChange({ search: "", status: "active", category: "", consignorId: "", sectionId: "", page: "1" });
            }}
            className="admin-chip-trigger text-red-600 border-red-600/20 bg-red-600/5 gap-1"
          >
            <span className="text-sm leading-none">×</span>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// ── Section filter with grouped pill layout ──

function SectionFilterPicker({ sections, value, onChange }: {
  sections: Section[];
  value: string;
  onChange: (val: string) => void;
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
        className={`${value ? "admin-chip-trigger-active" : "admin-chip-trigger"} gap-1.5`}
      >
        <MapPin size={11} />
        {selectedName ?? "Section"}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] bg-white border border-gray-100 rounded-xl shadow-lg w-60 flex flex-col max-h-[300px]"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="p-2 border-b border-gray-100 shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sections..."
                className="w-full py-1.5 pl-7 pr-2 text-xs border border-gray-200 rounded-lg outline-none box-border font-[inherit]"
              />
            </div>
          </div>
          <div className="overflow-y-auto scrollbar-none flex-1 py-1">
            {value && (
              <div
                onClick={() => pick("")}
                className="px-3 py-1.5 text-[11px] text-gray-400 cursor-pointer hover:bg-gray-50"
              >
                Clear section
              </div>
            )}
            {racks.length > 0 && (
              <>
                <div className="px-3 py-1.5 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Clothing Racks</div>
                <div className="flex flex-wrap gap-1 px-2.5 pb-2">
                  {racks.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => pick(s.id)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md font-[inherit] cursor-pointer border ${
                        s.id === value
                          ? "border-emerald-600 bg-emerald-50 text-emerald-600"
                          : "border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            {shelves.length > 0 && (
              <>
                <div className="px-3 py-1.5 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Shoe Storage</div>
                <div className="grid grid-cols-5 gap-[3px] px-2.5 pb-2">
                  {shelves.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => pick(s.id)}
                      className={`py-1 text-[11px] font-medium rounded text-center font-[inherit] cursor-pointer border ${
                        s.id === value
                          ? "border-emerald-600 bg-emerald-50 text-emerald-600"
                          : "border-gray-100 bg-gray-50 text-gray-500"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            {other.map((s) => (
              <div
                key={s.id}
                onClick={() => pick(s.id)}
                className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 ${
                  s.id === value
                    ? "font-semibold text-emerald-600 bg-emerald-50"
                    : "font-normal text-gray-700"
                }`}
              >
                {s.name}
              </div>
            ))}
            {racks.length === 0 && shelves.length === 0 && other.length === 0 && (
              <div className="p-3 text-xs text-gray-400 text-center">No sections match</div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
