type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: "13px",
  fontWeight: 500,
  borderRadius: "6px",
  border: "1px solid #e2e5ea",
  background: "white",
  color: "#1a1a1a",
  cursor: "pointer",
  transition: "background 0.15s, border-color 0.15s",
  fontFamily: "inherit",
};

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: "#4f46e5",
  color: "white",
  borderColor: "#4f46e5",
};

const disabledBtnStyle: React.CSSProperties = {
  ...btnStyle,
  color: "#c4c9d1",
  cursor: "not-allowed",
};

export default function Pagination({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  // Build page numbers: show at most 5 around current
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", marginTop: "16px" }}>
      <button
        style={page <= 1 ? disabledBtnStyle : btnStyle}
        onClick={() => page > 1 && onPageChange(page - 1)}
        disabled={page <= 1}
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
      >
        Next
      </button>
    </div>
  );
}
