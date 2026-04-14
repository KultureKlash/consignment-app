import type React from "react";
import { labelStyle } from "~/lib/admin/listing-ui";

// ── Section card styles ──

export const sectionCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(227,227,227,0.6)",
  borderRadius: "12px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  overflow: "hidden",
  marginBottom: "20px",
};

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

export const sectionBody: React.CSSProperties = {
  padding: "20px",
};

export const fieldLabel: React.CSSProperties = {
  ...labelStyle,
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
