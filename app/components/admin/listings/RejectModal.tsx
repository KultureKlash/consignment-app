export function RejectModal({
  onConfirm,
  onCancel,
  reason,
  setReason,
  title = "Reject Listing",
  description = "Provide a reason for rejection. The consignor will see this.",
  placeholder = "e.g. Item condition doesn't meet our standards...",
  confirmLabel = "Reject Listing",
}: {
  onConfirm: () => void;
  onCancel: () => void;
  reason: string;
  setReason: (r: string) => void;
  title?: string;
  description?: string;
  placeholder?: string;
  confirmLabel?: string;
}) {
  return (
    <div
      onClick={onCancel}
      className="admin-modal-overlay p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="admin-modal max-w-[420px] p-6"
      >
        <h3 className="text-[15px] font-semibold mt-0 mb-1">{title}</h3>
        <p className="text-[13px] text-gray-500 mt-0 mb-4">
          {description}
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder}
          className="admin-textarea"
          autoFocus
        />
        <div className="admin-modal-footer px-0 py-0 mt-4 border-0">
          <button
            onClick={onCancel}
            className="admin-btn-secondary text-[13px] px-4 py-2"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!reason.trim()}
            className={`px-4 py-2 text-[13px] font-semibold rounded-lg border-0 text-white font-[inherit] transition-colors duration-150 ${
              !reason.trim() ? "bg-red-300 cursor-not-allowed" : "bg-red-600 cursor-pointer hover:bg-red-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
