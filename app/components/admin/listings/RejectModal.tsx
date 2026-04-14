export function RejectModal({ onConfirm, onCancel, reason, setReason }: {
  onConfirm: () => void;
  onCancel: () => void;
  reason: string;
  setReason: (r: string) => void;
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "420px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <h3 style={{ fontSize: "15px", fontWeight: 600, margin: "0 0 4px" }}>Reject Listing</h3>
        <p style={{ fontSize: "13px", color: "#6d7175", margin: "0 0 16px" }}>
          Provide a reason for rejection. The consignor will see this.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Item condition doesn't meet our standards..."
          style={{
            width: "100%",
            minHeight: "80px",
            padding: "10px 12px",
            fontSize: "13px",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            fontFamily: "inherit",
            resize: "vertical",
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#111827"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(17,24,39,0.08)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }}
          autoFocus
        />
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 500,
              borderRadius: "8px",
              border: "1px solid #e3e3e3",
              background: "#fff",
              color: "#6d7175",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!reason.trim()}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "8px",
              border: "none",
              background: !reason.trim() ? "#fca5a5" : "#dc2626",
              color: "#fff",
              cursor: !reason.trim() ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "background 0.15s",
            }}
          >
            Reject Listing
          </button>
        </div>
      </div>
    </div>
  );
}
