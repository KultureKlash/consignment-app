import { Package, AlertCircle, Tag } from "lucide-react";
import type { DuplicateMatch } from "~/services/catalog";

type Props = {
  match: DuplicateMatch;
  isSubmitting?: boolean;
  /** Re-submit attaching to the named existing product. */
  onUseExisting: (productId: string) => void;
  onCancel: () => void;
};

/** Polymorphic modal — branches on `match.kind`. Used after submitListing throws
 *  DuplicateError. Consignor side: no "create anyway" escape on the similar case;
 *  the consignor must either pick an existing product or close the modal and edit
 *  their input. */
export function DuplicateMatchModal({ match, isSubmitting, onUseExisting, onCancel }: Props) {
  if (match.kind === "none") return null;

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel rounded-2xl p-6 w-full max-w-md"
      >
        {match.kind === "gtin" && (
          <GtinView
            existing={match.existing}
            isSubmitting={isSubmitting}
            onUseExisting={onUseExisting}
            onCancel={onCancel}
          />
        )}
        {match.kind === "exact-title" && (
          <ExactTitleView
            existing={match.existing}
            isSubmitting={isSubmitting}
            onUseExisting={onUseExisting}
            onCancel={onCancel}
          />
        )}
        {match.kind === "similar" && (
          <SimilarView
            candidates={match.candidates}
            isSubmitting={isSubmitting}
            onUseExisting={onUseExisting}
            onCancel={onCancel}
          />
        )}
      </div>
    </div>
  );
}

function GtinView({
  existing,
  isSubmitting,
  onUseExisting,
  onCancel,
}: {
  existing: Extract<DuplicateMatch, { kind: "gtin" }>["existing"];
  isSubmitting?: boolean;
  onUseExisting: (productId: string) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="w-4 h-4 text-amber-300" />
        <h3 className="text-base font-semibold">Barcode already in catalog</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        This barcode is registered to an existing product. Continue under that product so your listing matches the catalog.
      </p>
      <div className="mb-5 px-3 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
        <div className="text-sm font-semibold text-foreground">{existing.product.title}</div>
        {existing.product.brand && (
          <div className="text-xs text-muted-foreground mt-0.5">{existing.product.brand}</div>
        )}
        <div className="text-[11px] text-muted-foreground/70 mt-1.5 flex items-center gap-1.5">
          <Tag className="w-3 h-3" />
          {existing.variant.gtin}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/[0.06] hover:bg-white/[0.1] cursor-pointer transition-colors"
        >
          Edit barcode
        </button>
        <button
          onClick={() => onUseExisting(existing.product.id)}
          disabled={isSubmitting}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[hsl(var(--cta))]/15 text-[hsl(var(--cta))] hover:bg-[hsl(var(--cta))]/25 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Submitting..." : "Use existing product"}
        </button>
      </div>
    </>
  );
}

function ExactTitleView({
  existing,
  isSubmitting,
  onUseExisting,
  onCancel,
}: {
  existing: Extract<DuplicateMatch, { kind: "exact-title" }>["existing"];
  isSubmitting?: boolean;
  onUseExisting: (productId: string) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <Package className="w-4 h-4 text-primary" />
        <h3 className="text-base font-semibold">Adding to existing product?</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        This product already exists in our catalog. Confirm to attach your listing to it.
      </p>
      <div className="mb-5 px-3 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
        <div className="text-sm font-semibold text-foreground">{existing.title}</div>
        {existing.brand && (
          <div className="text-xs text-muted-foreground mt-0.5">{existing.brand}</div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/[0.06] hover:bg-white/[0.1] cursor-pointer transition-colors"
        >
          Edit title
        </button>
        <button
          onClick={() => onUseExisting(existing.id)}
          disabled={isSubmitting}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[hsl(var(--cta))]/15 text-[hsl(var(--cta))] hover:bg-[hsl(var(--cta))]/25 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Submitting..." : "Yes, attach my listing"}
        </button>
      </div>
    </>
  );
}

function SimilarView({
  candidates,
  isSubmitting,
  onUseExisting,
  onCancel,
}: {
  candidates: Extract<DuplicateMatch, { kind: "similar" }>["candidates"];
  isSubmitting?: boolean;
  onUseExisting: (productId: string) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="w-4 h-4 text-amber-300" />
        <h3 className="text-base font-semibold">Possible duplicate</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        We found {candidates.length === 1 ? "a similar product" : `${candidates.length} similar products`} in the catalog. Please pick the matching one to avoid creating a duplicate.
      </p>
      <div className="mb-5 space-y-2 max-h-72 overflow-y-auto">
        {candidates.map((c) => (
          <button
            key={c.id}
            onClick={() => onUseExisting(c.id)}
            disabled={isSubmitting}
            className="w-full text-left px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="text-sm font-semibold text-foreground">{c.title}</div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
              {c.brand && <span>{c.brand}</span>}
              {c.sku && <span>· SKU {c.sku}</span>}
              {c.activeVariantCount > 0 && <span>· {c.activeVariantCount} active variant{c.activeVariantCount === 1 ? "" : "s"}</span>}
            </div>
          </button>
        ))}
      </div>
      <button
        onClick={onCancel}
        className="w-full py-2.5 rounded-xl text-sm font-medium bg-white/[0.06] hover:bg-white/[0.1] cursor-pointer transition-colors"
      >
        Back — edit my submission
      </button>
    </>
  );
}
