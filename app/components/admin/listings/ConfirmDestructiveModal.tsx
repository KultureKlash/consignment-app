/** Small confirm modal for destructive bulk actions (delete, cancel).
 *  Centered on screen so the confirm button is nowhere near where any inline
 *  bar button might have been — second accidental tap cannot land on it.
 *  Same look as RejectModal but without the reason textarea. */
export function ConfirmDestructiveModal({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  disabled,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div onClick={onCancel} className="admin-modal-overlay p-4">
      <div onClick={(e) => e.stopPropagation()} className="admin-modal max-w-[420px] p-6">
        <h3 className="text-[15px] font-semibold mt-0 mb-1">{title}</h3>
        <p className="text-[13px] text-gray-500 mt-0 mb-4">{body}</p>
        <div className="admin-modal-footer px-0 py-0 mt-4 border-0">
          <button
            onClick={onCancel}
            className="admin-btn-secondary text-[13px] px-4 py-2"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={disabled}
            className="px-4 py-2 text-[13px] font-semibold rounded-lg border-0 text-white bg-red-600 cursor-pointer hover:bg-red-700 font-[inherit] transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
