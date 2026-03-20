type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  total?: number;
  limit?: number;
};

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: "13px",
  fontWeight: 500,
  borderRadius: "10px",
  border: "1px solid #e2e5ea",
  background: "white",
  color: "#1a1a1a",
  cursor: "pointer",
  transition: "background 0.15s, border-color 0.15s",
  fontFamily: "inherit",
};

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: "#111827",
  color: "white",
  borderColor: "#111827",
};

const disabledBtnStyle: React.CSSProperties = {
  ...btnStyle,
  color: "#c4c9d1",
  cursor: "not-allowed",
  background: "#f9fafb",
};

export default function Pagination({ page, totalPages, onPageChange, total, limit }: Props) {
  if (totalPages <= 1 && !total) return null;
  if (totalPages <= 1 && total !== undefined) {
    // Still show the count even on single page
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginTop: "16px" }}>
        {total !== undefined && limit && (
          <span style={{ fontSize: "13px", color: "#6d7175" }}>
            Showing {Math.min(total, limit)} of {total} listing{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    );
  }

  // Build page numbers: show at most 5 around current
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  const rangeStart = total !== undefined && limit ? (page - 1) * limit + 1 : undefined;
  const rangeEnd = total !== undefined && limit ? Math.min(page * limit, total) : undefined;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px", flexWrap: "wrap", gap: "12px" }}>
      {/* Showing X–Y of Z */}
      <div style={{ fontSize: "13px", color: "#6d7175" }}>
        {rangeStart !== undefined && rangeEnd !== undefined && total !== undefined
          ? `Showing ${rangeStart}–${rangeEnd} of ${total} listing${total !== 1 ? "s" : ""}`
          : ""}
      </div>

      {/* Page buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <button
          style={page <= 1 ? disabledBtnStyle : btnStyle}
          onClick={() => page > 1 && onPageChange(page - 1)}
          disabled={page <= 1}
          onMouseEnter={(e) => { if (page > 1) e.currentTarget.style.background = "#f3f4f6"; }}
          onMouseLeave={(e) => { if (page > 1) e.currentTarget.style.background = "white"; }}
        >
          Previous
        </button>
        {start > 1 && (
          <>
            <button style={btnStyle} onClick={() => onPageChange(1)}>1</button>
            {start > 2 && <span style={{ padding: "0 4px", color: "#9ca3af" }}>...</span>}
          </>
        )}
        {pages.map((p) => (
          <button
            key={p}
            style={p === page ? activeBtnStyle : btnStyle}
            onClick={() => onPageChange(p)}
            onMouseEnter={(e) => { if (p !== page) e.currentTarget.style.background = "#f3f4f6"; }}
            onMouseLeave={(e) => { if (p !== page) e.currentTarget.style.background = "white"; }}
          >
            {p}
          </button>
        ))}
        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span style={{ padding: "0 4px", color: "#9ca3af" }}>...</span>}
            <button style={btnStyle} onClick={() => onPageChange(totalPages)}>{totalPages}</button>
          </>
        )}
        <button
          style={page >= totalPages ? disabledBtnStyle : btnStyle}
          onClick={() => page < totalPages && onPageChange(page + 1)}
          disabled={page >= totalPages}
          onMouseEnter={(e) => { if (page < totalPages) e.currentTarget.style.background = "#f3f4f6"; }}
          onMouseLeave={(e) => { if (page < totalPages) e.currentTarget.style.background = "white"; }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
