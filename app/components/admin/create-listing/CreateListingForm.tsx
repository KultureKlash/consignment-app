import { User, Package, Tag, RefreshCw } from "lucide-react";
import type { Props } from "./types";
import SectionHeader from "./SectionHeader";
import { CreateListingProvider, useCreateListing } from "./CreateListingContext";
import ConsignorPicker from "./ConsignorPicker";
import ProductSearch from "./ProductSearch";
import NewProductFields from "./NewProductFields";
import { ExistingProductCategoryPicker } from "./CategoryPicker";
import VariantFields from "./VariantFields";
import { DuplicateMatchModal } from "./DuplicateMatchModal";

function CreateListingFormInner() {
  const ctx = useCreateListing();

  return (
    <div>
      <div className="admin-card mb-5">
        <SectionHeader icon={User} title="Consignor" badge="Required" />
        <div className="admin-card-body">
          <ConsignorPicker />
        </div>
      </div>

      <div className="admin-card mb-5">
        <SectionHeader icon={Package} title="Product" badge={ctx.hasProduct ? "Selected" : "Required"} />
        <div className="admin-card-body">
          <ProductSearch />
          {!ctx.selectedProductId && ctx.newProductMode && <NewProductFields />}
          {ctx.selectedProductId && ctx.selectedProduct && <ExistingProductCategoryPicker />}
        </div>
      </div>

      <div className="admin-card mb-5">
        <SectionHeader icon={Tag} title="Size & Pricing" />
        <div className="admin-card-body">
          <VariantFields />
        </div>
      </div>

      <button
        onClick={ctx.handleSubmit}
        disabled={ctx.isLoading}
        className="admin-btn-submit mb-6 tracking-[0.01em]"
      >
        {ctx.isLoading ? <span className="inline-flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Creating...</span> : "Create Listing"}
      </button>

      {ctx.duplicateMatch && (
        <DuplicateMatchModal
          match={ctx.duplicateMatch}
          isSubmitting={ctx.isLoading}
          onUseExisting={ctx.submitUseExisting}
          onForceCreate={ctx.submitForceCreate}
          onCancel={ctx.dismissDuplicateModal}
        />
      )}
    </div>
  );
}

export default function CreateListingForm({ consignors, knownBrands }: Props) {
  return (
    <CreateListingProvider consignors={consignors} knownBrands={knownBrands}>
      <CreateListingFormInner />
    </CreateListingProvider>
  );
}
