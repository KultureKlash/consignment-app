import type { DuplicateMatch } from "~/services/catalog";

type Props = {
  match: DuplicateMatch;
  isSubmitting?: boolean;
  onUseExisting: (productId: string) => void;
  onForceCreate: () => void;
  onCancel: () => void;
};

/** Admin variant of the dedup modal. GTIN and exact-title cases are still hard-block
 *  (unambiguous signals); only the "similar" case offers an override-and-create-new
 *  escape hatch so admin can resolve borderline cases. */
export function DuplicateMatchModal({ match, isSubmitting, onUseExisting, onForceCreate, onCancel }: Props) {
  if (match.kind === "none") return null;

  return (
    <div
      onClick={onCancel}
      className="admin-modal-overlay p-4"
    >
      <div onClick={(e) => e.stopPropagation()} className="admin-modal max-w-[480px] p-6">
        {match.kind === "gtin" && (
          <GtinView existing={match.existing} isSubmitting={isSubmitting} onUseExisting={onUseExisting} onCancel={onCancel} />
        )}
        {match.kind === "exact-title" && (
          <ExactTitleView existing={match.existing} isSubmitting={isSubmitting} onUseExisting={onUseExisting} onCancel={onCancel} />
        )}
        {match.kind === "similar" && (
          <SimilarView
            candidates={match.candidates}
            isSubmitting={isSubmitting}
            onUseExisting={onUseExisting}
            onForceCreate={onForceCreate}
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
      <h3 className="text-[15px] font-semibold mt-0 mb-1">Barcode already in catalog</h3>
      <p className="text-[13px] text-gray-500 mt-0 mb-4">
        This barcode ({existing.variant.gtin}) is on an existing variant. Continue under that product so the catalog stays clean.
      </p>
      <div className="mb-4 px-3 py-3 rounded-lg bg-gray-50 border border-gray-200">
        <div className="text-[13px] font-semibold text-gray-900">{existing.product.title}</div>
        {existing.product.brand && <div className="text-[12px] text-gray-500 mt-0.5">{existing.product.brand}</div>}
      </div>
      <div className="admin-modal-footer px-0 py-0 mt-4 border-0">
        <button onClick={onCancel} className="admin-btn-secondary text-[13px] px-4 py-2">Cancel</button>
        <button
          onClick={() => onUseExisting(existing.product.id)}
          disabled={isSubmitting}
          className="px-4 py-2 text-[13px] font-semibold rounded-lg border-0 text-white bg-gray-900 cursor-pointer hover:bg-gray-800 font-[inherit] disabled:opacity-60 disabled:cursor-not-allowed"
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
      <h3 className="text-[15px] font-semibold mt-0 mb-1">Adding to existing product?</h3>
      <p className="text-[13px] text-gray-500 mt-0 mb-4">
        A product with this exact title already exists. Confirm to attach your listing to it.
      </p>
      <div className="mb-4 px-3 py-3 rounded-lg bg-gray-50 border border-gray-200">
        <div className="text-[13px] font-semibold text-gray-900">{existing.title}</div>
        {existing.brand && <div className="text-[12px] text-gray-500 mt-0.5">{existing.brand}</div>}
      </div>
      <div className="admin-modal-footer px-0 py-0 mt-4 border-0">
        <button onClick={onCancel} className="admin-btn-secondary text-[13px] px-4 py-2">Cancel</button>
        <button
          onClick={() => onUseExisting(existing.id)}
          disabled={isSubmitting}
          className="px-4 py-2 text-[13px] font-semibold rounded-lg border-0 text-white bg-gray-900 cursor-pointer hover:bg-gray-800 font-[inherit] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Submitting..." : "Attach to existing"}
        </button>
      </div>
    </>
  );
}

function SimilarView({
  candidates,
  isSubmitting,
  onUseExisting,
  onForceCreate,
  onCancel,
}: {
  candidates: Extract<DuplicateMatch, { kind: "similar" }>["candidates"];
  isSubmitting?: boolean;
  onUseExisting: (productId: string) => void;
  onForceCreate: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <h3 className="text-[15px] font-semibold mt-0 mb-1">Possible duplicate</h3>
      <p className="text-[13px] text-gray-500 mt-0 mb-4">
        We found {candidates.length === 1 ? "a similar product" : `${candidates.length} similar products`} in the catalog. Use one of these, or override and create new.
      </p>
      <div className="mb-4 space-y-2 max-h-72 overflow-y-auto">
        {candidates.map((c) => (
          <button
            key={c.id}
            onClick={() => onUseExisting(c.id)}
            disabled={isSubmitting}
            className="w-full text-left px-3 py-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 cursor-pointer transition-colors disabled:opacity-50"
          >
            <div className="text-[13px] font-semibold text-gray-900">{c.title}</div>
            <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
              {c.brand && <span>{c.brand}</span>}
              {c.sku && <span>· SKU {c.sku}</span>}
              {c.activeVariantCount > 0 && (
                <span>· {c.activeVariantCount} active variant{c.activeVariantCount === 1 ? "" : "s"}</span>
              )}
            </div>
          </button>
        ))}
      </div>
      <div className="admin-modal-footer px-0 py-0 mt-4 border-0 flex gap-2">
        <button onClick={onCancel} className="admin-btn-secondary text-[13px] px-4 py-2">Cancel</button>
        <button
          onClick={onForceCreate}
          disabled={isSubmitting}
          className="px-4 py-2 text-[13px] font-semibold rounded-lg border-0 text-white bg-amber-600 cursor-pointer hover:bg-amber-700 font-[inherit] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Submitting..." : "Override — create new"}
        </button>
      </div>
    </>
  );
}
