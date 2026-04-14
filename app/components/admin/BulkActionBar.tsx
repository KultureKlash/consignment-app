import { LISTING_STATUS } from "~/lib/listing-statuses";

interface BulkActionBarProps {
  selectedIds: Set<string>;
  listings: Array<{ id: string; status: string }>;
  approvalLoading: boolean;
  cancelLoading: boolean;
  onClearSelection: () => void;
  onBulkApprove: () => void;
  onBulkCheckin: () => void;
  onBulkCancel: () => void;
}

export default function BulkActionBar({
  selectedIds,
  listings,
  approvalLoading,
  cancelLoading,
  onClearSelection,
  onBulkApprove,
  onBulkCheckin,
  onBulkCancel,
}: BulkActionBarProps) {
  if (selectedIds.size === 0) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 8px 8px 16px",
      background: "#fff",
      border: "1px solid rgba(227,227,227,0.6)",
      borderRadius: "10px",
      marginBottom: "12px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>
          {selectedIds.size} selected
        </span>
        <span
          onClick={onClearSelection}
          style={{ fontSize: "12px", color: "#9ca3af", cursor: "pointer", fontWeight: 500 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#6d7175"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#9ca3af"; }}
        >
          Clear
        </span>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        {listings.some((l) => selectedIds.has(l.id) && l.status === LISTING_STATUS.SUBMITTED) && (
          <BulkActionButton
            label={approvalLoading ? "Approving..." : "Approve selected"}
            onClick={onBulkApprove}
            disabled={approvalLoading}
            bg="#0d9488"
            bgHover="#0f766e"
          />
        )}
        {listings.some((l) => selectedIds.has(l.id) && l.status === LISTING_STATUS.APPROVED) && (
          <BulkActionButton
            label={approvalLoading ? "Checking in..." : "Check in selected"}
            onClick={onBulkCheckin}
            disabled={approvalLoading}
            bg="#2c6ecb"
            bgHover="#1e5aab"
          />
        )}
        {listings.some((l) => selectedIds.has(l.id) && l.status === LISTING_STATUS.ACTIVE) && (
          <BulkActionButton
            label={cancelLoading ? "Deleting..." : "Delete selected"}
            onClick={onBulkCancel}
            disabled={cancelLoading}
            bg="#7f1d1d"
            bgHover="#991b1b"
          />
        )}
      </div>
    </div>
  );
}

function BulkActionButton({ label, onClick, disabled, bg, bgHover }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  bg: string;
  bgHover: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 16px",
        fontSize: "12px",
        fontWeight: 600,
        borderRadius: "10px",
        border: "none",
        background: disabled ? bgHover : bg,
        color: "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = bgHover; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)"; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.background = bg; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; } }}
    >
      {label}
    </button>
  );
}
