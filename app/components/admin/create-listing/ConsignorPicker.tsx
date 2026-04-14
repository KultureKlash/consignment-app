import { useState } from "react";
import { Search } from "lucide-react";
import Dropdown, { dropdownItemStyle, handleItemHover } from "~/components/admin/Dropdown";
import {
  searchInputStyle,
  chipStyle,
  chipClear,
  searchIconWrap,
  handleFocus,
  handleBlurStyle,
} from "~/lib/admin/listing-ui";
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
      <p style={{ color: "#6d7175", fontSize: "13px", margin: 0 }}>
        No consignors found. Add one in the Consignors page.
      </p>
    );
  }

  if (selected) {
    return (
      <div style={chipStyle}>
        <span style={{ flex: 1 }}>
          <span style={{ fontWeight: 500 }}>{selected.name}</span>
          <span style={{ color: "#6b7280" }}>
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
          style={chipClear}
        >
          ✕
        </span>
      </div>
    );
  }

  return (
    <div ref={consignorInputRef} style={{ position: "relative" }}>
      <span style={searchIconWrap}>
        <Search size={16} />
      </span>
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setShowResults(true);
        }}
        onFocus={(e) => {
          setShowResults(true);
          handleFocus(e);
        }}
        onBlur={(e) => {
          setTimeout(() => setShowResults(false), 200);
          handleBlurStyle(e);
        }}
        placeholder="Search consignor by name or email..."
        style={{
          ...searchInputStyle,
          ...(fieldErrors.has("consignorId") ? { borderColor: "#ef4444" } : {}),
        }}
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
            style={dropdownItemStyle}
            onMouseEnter={(e) => handleItemHover(e, true)}
            onMouseLeave={(e) => handleItemHover(e, false)}
          >
            <div style={{ fontWeight: 600, color: "#1a1a1a", fontSize: "14px" }}>
              {c.name}
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
              {(c.feeRate * 100).toFixed(0)}% fee — {c.email}
            </div>
          </div>
        ))}
        {search.trim() && filtered.length === 0 && (
          <div
            style={{
              padding: "10px 14px",
              color: "#9ca3af",
              fontSize: "13px",
              textAlign: "center",
            }}
          >
            No consignors found
          </div>
        )}
      </Dropdown>
    </div>
  );
}
