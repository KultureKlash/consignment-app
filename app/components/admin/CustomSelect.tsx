import { useRef, useState, useEffect } from "react";
import Dropdown, { dropdownItemClass } from "./Dropdown";

type OptionItem = { label: string; value: string };

type CustomSelectProps = {
  options: string[] | OptionItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  searchable?: boolean;
  actionItem?: { label: string; onSelect: () => void };
  chipMode?: boolean;
  chipActive?: boolean;
  onClear?: () => void;
};

export default function CustomSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  hasError = false,
  searchable = false,
  actionItem,
  chipMode = false,
  chipActive = false,
  onClear,
}: CustomSelectProps) {
  // Normalize options to { label, value } pairs
  const normalizedOptions: OptionItem[] = options.map((opt) =>
    typeof opt === "string" ? { label: opt, value: opt } : opt,
  );
  const selectedLabel = normalizedOptions.find((o) => o.value === value)?.label ?? value;

  const anchorRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
    if (!open) setSearchQuery("");
  }, [open, searchable]);

  // Click-outside to close for searchable dropdowns
  useEffect(() => {
    if (!searchable || !open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      const inAnchor = anchorRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inAnchor && !inDropdown) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchable, open]);

  const filteredOptions = searchable && searchQuery
    ? normalizedOptions.filter((o) => o.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : normalizedOptions;

  const handleTriggerClick = () => {
    if (disabled) return;
    setOpen((prev) => !prev);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((prev) => !prev);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleBlur = () => {
    setTimeout(() => setOpen(false), 200);
  };

  const triggerClass = chipMode
    ? chipActive
      ? "admin-chip-trigger-active"
      : "admin-chip-trigger"
    : disabled
      ? "admin-input flex items-center justify-between cursor-not-allowed bg-gray-50 text-gray-500 select-none"
      : `admin-input flex items-center justify-between cursor-pointer select-none${hasError ? " border-red-500" : ""}`;

  return (
    <div ref={anchorRef} className="relative">
      <div
        tabIndex={disabled ? -1 : 0}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (!searchable) handleBlur(); }}
        className={triggerClass}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={`overflow-hidden text-ellipsis whitespace-nowrap min-w-0${value ? "" : " text-gray-400"}`}>
          {value ? selectedLabel : placeholder}
        </span>
        {chipMode && chipActive && onClear ? (
          <span
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onClear(); }}
            className="ml-0.5 text-[10px] leading-none opacity-60 hover:opacity-100 shrink-0"
          >
            ✕
          </span>
        ) : (
          <span className={chipMode
            ? "inline-block w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[4px] border-t-gray-400 ml-1 shrink-0"
            : "inline-block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-gray-400 ml-2 shrink-0"
          } />
        )}
      </div>

      <Dropdown anchorRef={anchorRef} open={open}>
        <div ref={dropdownRef}>
        {searchable && (
          <div className="px-2.5 py-2 border-b border-gray-100">
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="Type to search..."
              className="w-full px-2.5 py-1.5 text-[13px] border border-gray-200 rounded-md outline-none font-[inherit] box-border focus:border-gray-900 focus:shadow-[0_0_0_2px_rgba(17,24,39,0.08)]"
            />
          </div>
        )}
        <div className={searchable ? "max-h-[200px] overflow-y-auto" : undefined}>
          {filteredOptions.map((opt) => (
            <div
              key={opt.value}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.value);
                setOpen(false);
              }}
              className={`${dropdownItemClass}${opt.value === value ? " bg-indigo-50 font-medium" : ""}`}
              role="option"
              aria-selected={opt.value === value}
            >
              {opt.label}
            </div>
          ))}
          {filteredOptions.length === 0 && (
            <div className="px-3.5 py-2.5 text-gray-400 text-[13px] text-center">
              No matches
            </div>
          )}
        </div>
        {actionItem && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              actionItem.onSelect();
              setOpen(false);
            }}
            className="px-3.5 py-2.5 cursor-pointer text-sm text-indigo-600 font-semibold border-t border-gray-100 mt-1 transition-colors duration-100 hover:bg-gray-100"
          >
            {actionItem.label}
          </div>
        )}
        </div>
      </Dropdown>
    </div>
  );
}
