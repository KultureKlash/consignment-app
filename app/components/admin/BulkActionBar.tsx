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
    <div className="flex items-center justify-between pl-4 pr-2 py-2 bg-white border border-gray-200/60 rounded-[10px] mb-3 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="text-[13px] font-semibold text-gray-900">
          {selectedIds.size} selected
        </span>
        <span
          onClick={onClearSelection}
          className="text-xs text-gray-400 cursor-pointer font-medium hover:text-gray-500 transition-colors"
        >
          Clear
        </span>
      </div>
      <div className="flex gap-2">
        {listings.some((l) => selectedIds.has(l.id) && l.status === LISTING_STATUS.SUBMITTED) && (
          <BulkActionButton
            label={approvalLoading ? "Approving..." : "Approve selected"}
            onClick={onBulkApprove}
            disabled={approvalLoading}
            bg="bg-teal-600"
            bgHover="hover:bg-teal-700"
          />
        )}
        {listings.some((l) => selectedIds.has(l.id) && l.status === LISTING_STATUS.APPROVED) && (
          <BulkActionButton
            label={approvalLoading ? "Checking in..." : "Check in selected"}
            onClick={onBulkCheckin}
            disabled={approvalLoading}
            bg="bg-blue-600"
            bgHover="hover:bg-blue-700"
          />
        )}
        {listings.some((l) => selectedIds.has(l.id) && l.status === LISTING_STATUS.ACTIVE) && (
          <BulkActionButton
            label={cancelLoading ? "Deleting..." : "Delete selected"}
            onClick={onBulkCancel}
            disabled={cancelLoading}
            bg="bg-red-900"
            bgHover="hover:bg-red-800"
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
      className={`px-4 py-[7px] text-xs font-semibold rounded-[10px] border-none text-white cursor-pointer font-[inherit] transition-all duration-200 ease-in-out ${bg} ${bgHover} hover:-translate-y-px hover:shadow-md disabled:opacity-80 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none`}
    >
      {label}
    </button>
  );
}
