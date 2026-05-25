export type Listing = {
  id: string;
  price: number | { toFixed: (digits: number) => string } | null;
  cost?: number | null;
  status: string;
  createdAt: string | Date;
  listedAt?: string | Date | null;
  consignor: { name: string; email: string; storeOwned?: boolean };
  variant: {
    size: string;
    gtin: string | null;
    shopifyVariantId?: string | null;
    product: { id: string; title: string; sku: string | null; brand: string | null; category?: string | null; imageUrl?: string | null; sectionId?: string | null; section?: { name: string } | null };
  };
};

export type EditApproveFields = {
  size: string;
  gtin: string;
  price: string;
  cost?: string;
};

export type EditProductFields = {
  title: string;
  brand: string;
  category: string;
  sku: string;
  imageData?: string;
};

export type SortKey = "date" | "price" | "status";

export type VariantInfo = {
  size: string;
  gtin: string | null;
};

export type ProductGroup = {
  productId: string;
  title: string;
  sku: string | null;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  sectionId: string | null;
  sectionName: string | null;
  variants: VariantInfo[];
  listings: Listing[];
};

export type SectionOption = { id: string; name: string };

export type Props = {
  listings: Listing[];
  grouped?: boolean;
  onCancel?: (listingId: string) => void;
  onRestore?: (listingId: string) => void;
  onApprove?: (listingId: string) => void;
  onReject?: (listingId: string, reason: string) => void;
  onCheckin?: (listingId: string) => void;
  onApproveWithdrawal?: (listingId: string) => void;
  onDenyWithdrawal?: (listingId: string, reason?: string) => void;
  onCompleteWithdrawal?: (listingId: string) => void;
  onRetrySync?: (listingId: string) => void;
  syncingListingId?: string;
  onEditApprove?: (listingId: string, fields: EditApproveFields) => void;
  onAdminEdit?: (listingId: string, fields: EditApproveFields) => void;
  onUpdateCost?: (listingId: string, cost: string) => void;
  onEditProduct?: (productId: string, fields: EditProductFields) => void;
  onQuickAdd?: (productId: string, anchorEl: HTMLElement) => void;
  isLoading?: boolean;
  isNavigating?: boolean;
  sortBy?: SortKey;
  sortDir?: "asc" | "desc";
  onSortChange?: (sortBy: SortKey) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  sections?: SectionOption[];
  onSectionChange?: (productId: string, sectionId: string | null) => void;
};
