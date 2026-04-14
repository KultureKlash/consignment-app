import type React from "react";

// ── Section card/header styles (migrated to admin.css classes in CreateListingForm) ──
// These legacy CSSProperties objects are kept only for SectionHeader which still uses style={}.

export const sectionHeaderStyle: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid rgba(227,227,227,0.5)",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

export const sectionTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#1a1a1a",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  margin: 0,
};

// ── Field label (still used as style={} by several components) ──

export const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "6px",
};

export const helperText: React.CSSProperties = {
  fontSize: "11px",
  color: "#9ca3af",
  marginTop: "4px",
};
