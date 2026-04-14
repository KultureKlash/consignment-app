import { User, Package, Tag } from "lucide-react";
import type { Props } from "./types";
import { sectionCard, sectionBody } from "./helpers";
import SectionHeader from "./SectionHeader";
import { CreateListingProvider, useCreateListing } from "./CreateListingContext";
import ConsignorPicker from "./ConsignorPicker";
import ProductSearch from "./ProductSearch";
import NewProductFields from "./NewProductFields";
import { ExistingProductCategoryPicker } from "./CategoryPicker";
import VariantFields from "./VariantFields";

function CreateListingFormInner() {
  const ctx = useCreateListing();

  const submitBtnBase = {
    width: "100%", padding: "16px 24px", fontSize: "15px", fontWeight: 600,
    color: "#fff", background: ctx.isLoading ? "#374151" : "#111827", border: "none",
    borderRadius: "10px", cursor: ctx.isLoading ? "not-allowed" as const : "pointer" as const,
    transition: "all 0.2s ease", fontFamily: "inherit",
    boxShadow: ctx.isLoading ? "none" : "0 2px 8px rgba(0,0,0,0.2)",
    marginBottom: "24px", letterSpacing: "0.01em",
  };

  return (
    <div>
      <div style={sectionCard}>
        <SectionHeader icon={User} title="Consignor" badge="Required" />
        <div style={sectionBody}>
          <ConsignorPicker />
        </div>
      </div>

      <div style={sectionCard}>
        <SectionHeader icon={Package} title="Product" badge={ctx.hasProduct ? "Selected" : "Required"} />
        <div style={sectionBody}>
          <ProductSearch />
          {!ctx.selectedProductId && ctx.newProductMode && <NewProductFields />}
          {ctx.selectedProductId && ctx.selectedProduct && <ExistingProductCategoryPicker />}
        </div>
      </div>

      <div style={sectionCard}>
        <SectionHeader icon={Tag} title="Size & Pricing" />
        <div style={sectionBody}>
          <VariantFields />
        </div>
      </div>

      <button
        onClick={ctx.handleSubmit}
        disabled={ctx.isLoading}
        style={submitBtnBase}
        onMouseEnter={(e) => {
          if (!ctx.isLoading) {
            e.currentTarget.style.background = "#1f2937";
            e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.25)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }
        }}
        onMouseLeave={(e) => {
          if (!ctx.isLoading) {
            e.currentTarget.style.background = "#111827";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
            e.currentTarget.style.transform = "translateY(0)";
          }
        }}
      >
        {ctx.isLoading ? "Creating..." : "Create Listing"}
      </button>
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
