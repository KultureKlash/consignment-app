import { Package } from "lucide-react";
import type { Props } from "./types";
import { GroupedView } from "./GroupedView";
import { FlatView } from "./FlatView";

export default function ListingsTable(props: Props) {
  const { listings, grouped, isNavigating } = props;

  if (listings.length === 0 && !isNavigating) {
    return (
      <div className="text-center py-12 px-5">
        <Package size={44} className="text-gray-300 mb-3.5 mx-auto" />
        <p className="text-sm text-gray-500 m-0 leading-normal">
          No listings found.
        </p>
      </div>
    );
  }

  if (grouped) {
    return (
      <GroupedView
        listings={listings}
        onCancel={props.onCancel}
        onRestore={props.onRestore}
        onApprove={props.onApprove}
        onReject={props.onReject}
        onCheckin={props.onCheckin}
        onApproveWithdrawal={props.onApproveWithdrawal}
        onDenyWithdrawal={props.onDenyWithdrawal}
        onCompleteWithdrawal={props.onCompleteWithdrawal}
        onRetrySync={props.onRetrySync}
        syncingListingId={props.syncingListingId}
        onEditApprove={props.onEditApprove}
        onAdminEdit={props.onAdminEdit}
        onUpdateCost={props.onUpdateCost}
        onEditProduct={props.onEditProduct}
        onQuickAdd={props.onQuickAdd}
        isLoading={props.isLoading}
        isNavigating={props.isNavigating}
        selectedIds={props.selectedIds}
        onSelectionChange={props.onSelectionChange}
        sections={props.sections}
        onSectionChange={props.onSectionChange}
      />
    );
  }

  return (
    <FlatView
      listings={listings}
      onCancel={props.onCancel}
      isLoading={props.isLoading}
      isNavigating={props.isNavigating}
      sortBy={props.sortBy}
      sortDir={props.sortDir}
      onSortChange={props.onSortChange}
      selectedIds={props.selectedIds}
      onSelectionChange={props.onSelectionChange}
    />
  );
}
