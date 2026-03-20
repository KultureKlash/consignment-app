import { useRef, useState } from "react";
import Dropdown, { dropdownItemStyle, handleItemHover } from "./Dropdown";

type OptionItem = { label: string; value: string };

type CustomSelectProps = {
  options: string[] | OptionItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  actionItem?: { label: string; onSelect: () => void };
};

const triggerStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  fontSize: "14px",
  borderRadius: "8px",
  border: "1px solid #c4c9d1",
  boxSizing: "border-box",
  fontFamily: "inherit",
  transition: "border-color 0.2s, box-shadow 0.2s",
  outline: "none",
  color: "#1a1a1a",
  background: "white",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  userSelect: "none",
};

const disabledTriggerStyle: React.CSSProperties = {
  ...triggerStyle,
  background: "#f9fafb",
  color: "#6b7280",
  cursor: "not-allowed",
};

const chevronStyle: React.CSSProperties = {
  width: 0,
  height: 0,
  borderLeft: "4px solid transparent",
  borderRight: "4px solid transparent",
  borderTop: "5px solid #9ca3af",
  marginLeft: "8px",
  flexShrink: 0,
};

export default function CustomSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  hasError = false,
  actionItem,
}: CustomSelectProps) {
  // Normalize options to { label, value } pairs
  const normalizedOptions: OptionItem[] = options.map((opt) =>
    typeof opt === "string" ? { label: opt, value: opt } : opt,
  );
  const selectedLabel = normalizedOptions.find((o) => o.value === value)?.label ?? value;

  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

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

  const baseStyle = disabled ? disabledTriggerStyle : triggerStyle;
  const errorOverride = hasError && !disabled ? { borderColor: "#ef4444" } : {};
  const focusRef = useRef(false);

  const handleFocusIn = (e: React.FocusEvent<HTMLDivElement>) => {
    if (disabled) return;
    focusRef.current = true;
    if (!hasError) {
      e.currentTarget.style.borderColor = "#4f46e5";
      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.12)";
    }
  };

  const handleFocusOut = (e: React.FocusEvent<HTMLDivElement>) => {
    focusRef.current = false;
    e.currentTarget.style.borderColor = hasError ? "#ef4444" : "#c4c9d1";
    e.currentTarget.style.boxShadow = "none";
    handleBlur();
  };

  return (
    <div ref={anchorRef} style={{ position: "relative" }}>
      <div
        tabIndex={disabled ? -1 : 0}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
        onFocus={handleFocusIn}
        onBlur={handleFocusOut}
        style={{ ...baseStyle, ...errorOverride }}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span style={value ? undefined : { color: "#9ca3af" }}>
          {value ? selectedLabel : placeholder}
        </span>
        <span style={chevronStyle} />
      </div>

      <Dropdown anchorRef={anchorRef} open={open}>
        {normalizedOptions.map((opt) => (
          <div
            key={opt.value}
            onMouseDown={(e) => {
              e.preventDefault();
              onChange(opt.value);
              setOpen(false);
            }}
            style={{
              ...dropdownItemStyle,
              ...(opt.value === value ? { background: "#f0f4ff", fontWeight: 500 } : {}),
            }}
            onMouseEnter={(e) => handleItemHover(e, true)}
            onMouseLeave={(e) => handleItemHover(e, false)}
            role="option"
            aria-selected={opt.value === value}
          >
            {opt.label}
          </div>
        ))}
        {actionItem && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              actionItem.onSelect();
              setOpen(false);
            }}
            style={{
              padding: "10px 14px",
              cursor: "pointer",
              fontSize: "14px",
              color: "#4f46e5",
              fontWeight: 600,
              borderTop: "1px solid #f0f0f0",
              transition: "background 0.12s ease",
              margin: "4px 0 0 0",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {actionItem.label}
          </div>
        )}
        {normalizedOptions.length === 0 && !actionItem && (
          <div style={{ padding: "10px 14px", color: "#9ca3af", fontSize: "13px", textAlign: "center" }}>
            No options
          </div>
        )}
      </Dropdown>
    </div>
  );
}
