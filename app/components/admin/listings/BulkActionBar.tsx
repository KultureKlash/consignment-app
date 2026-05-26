import { LISTING_STATUS } from "~/lib/domain";

const SELECTABLE_STATUSES = [
  LISTING_STATUS.SUBMITTED,
  LISTING_STATUS.APPROVED,
  LISTING_STATUS.ACTIVE,
  LISTING_STATUS.WITHDRAWAL_REQUESTED,
  LISTING_STATUS.PENDING_PICKUP,
] as string[];

interface BulkActionBarProps {
  selectedIds: Set<string>;
  listings: Array<{ id: string; status: string }>;
  approvalLoading: boolean;
  cancelLoading: boolean;
  onClearSelection: () => void;
  onSelectAllVisible: () => void;
  onBulkApprove: () => void;
  onBulkCheckin: () => void;
  onBulkCancel: () => void;
  onBulkApproveWithdrawal: () => void;
  onBulkDenyWithdrawal: () => void;
  onBulkCompleteWithdrawal: () => void;
}

export default function BulkActionBar({
  selectedIds,
  listings,
  approvalLoading,
  cancelLoading,
  onClearSelection,
  onSelectAllVisible,
  onBulkApprove,
  onBulkCheckin,
  onBulkCancel,
  onBulkApproveWithdrawal,
  onBulkDenyWithdrawal,
  onBulkCompleteWithdrawal,
}: BulkActionBarProps) {
  const withdrawalRequestedCount = listings.filter((l) => selectedIds.has(l.id) && l.status === LISTING_STATUS.WITHDRAWAL_REQUESTED).length;
  const pendingPickupCount = listings.filter((l) => selectedIds.has(l.id) && l.status === LISTING_STATUS.PENDING_PICKUP).length;
  const selectableIds = listings.filter((l) => SELECTABLE_STATUSES.includes(l.status)).map((l) => l.id);
  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  if (selectedIds.size === 0) {
    // Pre-selection hint: only render if there's something selectable on the page.
    // LEFT-aligned on purpose — after the user taps, destructive buttons appear
    // on the RIGHT side of the post-selection bar. Putting Select-all on the LEFT
    // means a same-position double-tap can never land on a destructive action.
    if (selectableIds.length === 0) return null;
    return (
      <div className="flex items-center justify-start pl-4 pr-2 py-1.5 mb-3 text-xs">
        <button
          onClick={onSelectAllVisible}
          className="text-gray-500 hover:text-gray-700 font-semibold cursor-pointer transition-colors"
        >
          Select all {selectableIds.length} on page
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between pl-4 pr-2 py-2 bg-white border border-gray-200/60 rounded-[10px] mb-3 shadow-sm gap-2">
      <div className="flex items-center gap-4">
        <span className="text-[13px] font-semibold text-gray-900">
          {selectedIds.size} selected
        </span>
        <button
          onClick={onSelectAllVisible}
          className="text-xs text-gray-500 cursor-pointer font-semibold hover:text-gray-700 transition-colors"
        >
          {allVisibleSelected ? "Unselect all" : `Select all ${selectableIds.length}`}
        </button>
        <span
          onClick={onClearSelection}
          className="text-xs text-gray-400 cursor-pointer font-medium hover:text-gray-500 transition-colors"
        >
          Clear
        </span>
      </div>
      <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
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
        {withdrawalRequestedCount > 0 && (
          <>
            <BulkActionButton
              label={approvalLoading ? "Approving..." : `Approve withdrawals (${withdrawalRequestedCount})`}
              onClick={onBulkApproveWithdrawal}
              disabled={approvalLoading}
              bg="bg-amber-600"
              bgHover="hover:bg-amber-700"
            />
            <BulkActionButton
              label={approvalLoading ? "Denying..." : `Deny withdrawals (${withdrawalRequestedCount})`}
              onClick={onBulkDenyWithdrawal}
              disabled={approvalLoading}
              bg="bg-gray-700"
              bgHover="hover:bg-gray-800"
            />
          </>
        )}
        {pendingPickupCount > 0 && (
          <BulkActionButton
            label={approvalLoading ? "Marking..." : `Mark picked up (${pendingPickupCount})`}
            onClick={onBulkCompleteWithdrawal}
            disabled={approvalLoading}
            bg="bg-cyan-700"
            bgHover="hover:bg-cyan-800"
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
