import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { CATEGORIES, MAIN_CATEGORIES } from "~/lib/categories";
import { inputStyle, searchInputStyle, searchIconWrap, handleFocus, handleBlurStyle } from "~/lib/listing-ui";
import CustomSelect from "~/components/CustomSelect";

type Consignor = { id: string; name: string };

type Props = {
  search: string;
  status: string;
  category: string;
  consignorId: string;
  consignors: Consignor[];
  onFilterChange: (params: Record<string, string>) => void;
};

const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Pending", value: "pending_sale" },
  { label: "Sold", value: "sold" },
  { label: "Cancelled", value: "cancelled" },
];

export default function ListingsFilter({
  search: initialSearch,
  status,
  category,
  consignorId,
  consignors,
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

  // Derive main/sub from combined category param (e.g. "Footwear > Sneakers")
  const categoryParts = category.split(" > ");
  const mainCategory = categoryParts[0] || "";
  const subCategory = categoryParts[1] || "";
  const subOptions = mainCategory ? (CATEGORIES[mainCategory] ?? []) : [];

  const hasFilters = (status && status !== "active") || category || consignorId || initialSearch;

  const consignorNames = consignors.map((c) => c.name);
  const selectedConsignorName = consignors.find((c) => c.id === consignorId)?.name ?? "";

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end", marginBottom: "16px" }}>
      {/* Search */}
      <div style={{ flex: "1 1 240px", position: "relative" }}>
        <span style={searchIconWrap}><Search size={16} /></span>
        <input
          type="text"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlurStyle}
          placeholder="Search by product, style ID, or consignor..."
          style={searchInputStyle}
        />
      </div>

      {/* Status */}
      <div style={{ flex: "0 0 150px" }}>
        <CustomSelect
          options={STATUS_OPTIONS}
          value={status}
          onChange={(val) => onFilterChange({ status: val === status ? "all" : val, page: "1" })}
          placeholder="Status"
        />
      </div>

      {/* Category */}
      <div style={{ flex: "0 0 150px" }}>
        <CustomSelect
          options={MAIN_CATEGORIES}
          value={mainCategory}
          onChange={(val) => onFilterChange({ category: val === mainCategory ? "" : val, page: "1" })}
          placeholder="Category"
        />
      </div>

      {/* Subcategory — only when a main category is selected */}
      {mainCategory && subOptions.length > 0 && (
        <div style={{ flex: "0 0 160px" }}>
          <CustomSelect
            options={subOptions}
            value={subCategory}
            onChange={(val) => {
              if (val === subCategory) {
                // Toggle off — go back to main category only
                onFilterChange({ category: mainCategory, page: "1" });
              } else {
                onFilterChange({ category: `${mainCategory} > ${val}`, page: "1" });
              }
            }}
            placeholder="Subcategory"
            searchable
          />
        </div>
      )}

      {/* Consignor */}
      <div style={{ flex: "0 0 170px" }}>
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
        />
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <span
          onClick={() => {
            setSearchValue("");
            onFilterChange({ search: "", status: "active", category: "", consignorId: "", page: "1" });
          }}
          style={{
            fontSize: "13px",
            color: "#4f46e5",
            fontWeight: 500,
            cursor: "pointer",
            padding: "10px 0",
          }}
        >
          Clear filters
        </span>
      )}
    </div>
  );
}
