import { useState } from "react";
import { Search } from "lucide-react";
import Dropdown from "~/components/admin/shared/Dropdown";
import { useCreateListing } from "./CreateListingContext";

export default function ConsignorPicker() {
  const {
    consignors,
    selectedConsignor,
    setSelectedConsignor,
    fieldErrors,
    clearError,
    consignorInputRef,
  } = useCreateListing();

  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);

  const selected = consignors.find((c) => c.id === selectedConsignor);
  const filtered = search.trim()
    ? consignors.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.email.toLowerCase().includes(search.toLowerCase()),
      )
    : consignors;

  if (consignors.length === 0) {
    return (
      <p className="text-gray-500 text-[13px] m-0">
        No consignors found. Add one in the Consignors page.
      </p>
    );
  }

  if (selected) {
    return (
      <div className="admin-chip">
        <span className="flex-1">
          <span className="font-medium">{selected.name}</span>
          <span className="text-gray-500">
            {" "}
            ({(selected.feeRate * 100).toFixed(0)}% fee) — {selected.email}
          </span>
        </span>
        <span
          onMouseDown={(e) => {
            e.preventDefault();
            setSelectedConsignor("");
            setSearch("");
          }}
          className="admin-chip-clear"
        >
          ✕
        </span>
      </div>
    );
  }

  return (
    <div ref={consignorInputRef} className="relative">
      <span className="admin-search-icon">
        <Search size={16} />
      </span>
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setShowResults(true);
        }}
        onFocus={() => setShowResults(true)}
        onBlur={() => setTimeout(() => setShowResults(false), 200)}
        placeholder="Search consignor by name or email..."
        className={`admin-input-search${fieldErrors.has("consignorId") ? " !border-red-500" : ""}`}
      />
      <Dropdown anchorRef={consignorInputRef} open={showResults}>
        {filtered.map((c) => (
          <div
            key={c.id}
            onMouseDown={(e) => {
              e.preventDefault();
              setSelectedConsignor(c.id);
              setSearch("");
              setShowResults(false);
              clearError("consignorId");
            }}
            className="admin-dropdown-item"
          >
            <div className="font-semibold text-gray-900 text-sm">
              {c.name}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {(c.feeRate * 100).toFixed(0)}% fee — {c.email}
            </div>
          </div>
        ))}
        {search.trim() && filtered.length === 0 && (
          <div className="px-3.5 py-2.5 text-gray-400 text-[13px] text-center">
            No consignors found
          </div>
        )}
      </Dropdown>
    </div>
  );
}
