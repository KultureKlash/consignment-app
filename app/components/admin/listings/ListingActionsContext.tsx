import { createContext, useContext } from "react";
import type { Listing, ProductGroup, SectionOption } from "./types";

export interface ListingActions {
  // Required — always provided
  onCancel?: (id: string) => void;
  onRestore?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onCheckin?: (id: string) => void;
  onApproveWithdrawal?: (id: string) => void;
  onDenyWithdrawal?: (id: string) => void;
  onCompleteWithdrawal?: (id: string) => void;
  onRetrySync?: (id: string) => void;
  onAdminEdit?: (listing: Listing) => void;
  onEditApprove?: (listing: Listing) => void;
  onEditProduct?: (group: ProductGroup) => void;
  onQuickAdd?: (productId: string, anchorEl: HTMLElement) => void;
  onSectionChange?: (productId: string, sectionId: string | null) => void;
  onToggleId: (id: string) => void;
  onToggleGroup: (ids: string[]) => void;
  isLoading?: boolean;
  syncingListingId?: string;
  selectedIds?: Set<string>;
  sections?: SectionOption[];
}

const ListingActionsCtx = createContext<ListingActions | null>(null);

export function ListingActionsProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: ListingActions;
}) {
  return (
    <ListingActionsCtx.Provider value={value}>
      {children}
    </ListingActionsCtx.Provider>
  );
}

export function useListingActions(): ListingActions {
  const ctx = useContext(ListingActionsCtx);
  if (!ctx)
    throw new Error(
      "useListingActions must be used inside ListingActionsProvider",
    );
  return ctx;
}
