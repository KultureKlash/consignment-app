import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "~/db.server";
import { queryListings } from "~/services/listing-queries.server";
import { handleListingAction } from "~/services/admin/listing-actions.server";
import { useListingToasts } from "~/components/admin/listings/useListingToasts";
import ListingsFilter from "~/components/admin/ListingsFilter";
import ListingsTable from "~/components/admin/listings";
import type { EditApproveFields, EditProductFields } from "~/components/admin/listings";
import Pagination from "~/components/admin/listings/Pagination";
import QuickAddPopover from "~/components/admin/QuickAddPopover";
import BulkActionBar from "~/components/admin/BulkActionBar";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const { backfillProductImages } = await import("~/services/shopify/products.server");
  await backfillProductImages(admin);

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const status = url.searchParams.get("status") ?? "active";
  const category = url.searchParams.get("category") ?? "";
  const consignorId = url.searchParams.get("consignorId") ?? "";
  const sortBy = (url.searchParams.get("sortBy") as "date" | "price" | "status") || "date";
  const sortDir = (url.searchParams.get("sortDir") as "asc" | "desc") || "desc";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const sectionId = url.searchParams.get("sectionId") ?? "";

  const [result, consignors, sections] = await Promise.all([
    queryListings({
      search: search || undefined,
      status: status && status !== "all" ? status : undefined,
      category: category || undefined,
      consignorId: consignorId || undefined,
      sectionId: sectionId || undefined,
      sortBy, sortDir, page, limit: 25, grouped: true,
    }),
    prisma.consignor.findMany({ select: { id: true, name: true, storeOwned: true }, orderBy: { name: "asc" } }),
    prisma.storeSection.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return { ...result, consignors, sections, filters: { search, status, category, consignorId, sectionId }, sortBy, sortDir };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  try {
    return await handleListingAction(admin, formData);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message, intent: formData.get("intent") as string };
  }
};

export default function Listings() {
  const { listings, total, page, totalPages, consignors, sections, filters, sortBy, sortDir } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const cancelFetcher = useFetcher();
  const addFetcher = useFetcher();
  const approvalFetcher = useFetcher();
  const sectionFetcher = useFetcher();
  const shopify = useAppBridge();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quickAdd, setQuickAdd] = useState<{ productId: string; anchorEl: HTMLElement } | null>(null);

  const isNavigating = navigation.state === "loading";
  const cancelLoading = ["loading", "submitting"].includes(cancelFetcher.state);
  const addLoading = ["loading", "submitting"].includes(addFetcher.state);
  const approvalLoading = ["loading", "submitting"].includes(approvalFetcher.state);

  useEffect(() => { setSelectedIds(new Set()); }, [listings]);

  useListingToasts(shopify, { cancel: cancelFetcher, add: addFetcher, approval: approvalFetcher }, {
    clearSelection: () => setSelectedIds(new Set()),
    closeQuickAdd: () => setQuickAdd(null),
  });

  const handleFilterChange = (params: Record<string, string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(params)) {
        if (value) next.set(key, value); else next.delete(key);
      }
      return next;
    });
  };

  const submitCancel = (intent: string, data: Record<string, string>) =>
    cancelFetcher.submit({ intent, ...data }, { method: "POST" });
  const submitApproval = (intent: string, data: Record<string, string>) =>
    approvalFetcher.submit({ intent, ...data }, { method: "POST" });

  const handleQuickAdd = (productId: string, anchorEl: HTMLElement) => {
    setQuickAdd(quickAdd?.productId === productId ? null : { productId, anchorEl });
  };

  const quickAddData = (() => {
    if (!quickAdd) return null;
    const groupListing = listings.find((l) => l.variant.product.id === quickAdd.productId);
    if (!groupListing) return null;
    const product = groupListing.variant.product;
    const variantMap = new Map<string, { size: string; gtin: string | null }>();
    for (const l of listings) {
      if (l.variant.product.id === quickAdd.productId && !variantMap.has(l.variant.size)) {
        variantMap.set(l.variant.size, { size: l.variant.size, gtin: l.variant.gtin });
      }
    }
    return {
      productId: quickAdd.productId,
      title: product.title, brand: product.brand, sku: product.sku,
      category: (product as { category?: string | null }).category ?? null,
      variants: Array.from(variantMap.values()),
    };
  })();

  return (
    <s-page heading="Listings">
      <s-section>
        <div style={{ marginBottom: "8px", fontSize: "13px", color: "#6d7175" }}>
          {total} listing{total !== 1 ? "s" : ""} total
        </div>
        <ListingsFilter
          search={filters.search} status={filters.status} category={filters.category}
          consignorId={filters.consignorId} sectionId={filters.sectionId}
          consignors={consignors} sections={sections} onFilterChange={handleFilterChange}
        />
        <BulkActionBar
          selectedIds={selectedIds}
          listings={listings}
          approvalLoading={approvalLoading}
          cancelLoading={cancelLoading}
          onClearSelection={() => setSelectedIds(new Set())}
          onBulkApprove={() => submitApproval("bulk-approve", { listingIds: Array.from(selectedIds).join(",") })}
          onBulkCheckin={() => submitApproval("bulk-checkin", { listingIds: Array.from(selectedIds).join(",") })}
          onBulkCancel={() => submitCancel("bulk-delete", { listingIds: Array.from(selectedIds).join(",") })}
        />
        <ListingsTable
          listings={listings} grouped
          onCancel={(id) => submitCancel("delete", { listingId: id })}
          onRestore={(id) => submitCancel("restore", { listingId: id })}
          onApprove={(id) => submitApproval("approve", { listingId: id })}
          onReject={(id, reason) => submitApproval("reject", { listingId: id, reason })}
          onCheckin={(id) => submitApproval("checkin", { listingId: id })}
          onApproveWithdrawal={(id) => submitApproval("approve-withdrawal", { listingId: id })}
          onCompleteWithdrawal={(id) => submitApproval("complete-withdrawal", { listingId: id })}
          onEditApprove={(id, fields: EditApproveFields) => submitApproval("admin-edit-approve", { listingId: id, ...fields })}
          onAdminEdit={(id, fields: EditApproveFields) => {
            const d: Record<string, string> = { listingId: id, ...fields };
            if (!fields.cost) delete d.cost;
            submitApproval("admin-edit", d);
          }}
          onEditProduct={(productId, fields: EditProductFields) => {
            const d: Record<string, string> = { productId, ...fields };
            if (!fields.imageData) delete d.imageData;
            sectionFetcher.submit({ intent: "edit-product", ...d }, { method: "POST" });
          }}
          onQuickAdd={handleQuickAdd}
          isLoading={cancelLoading || approvalLoading} isNavigating={isNavigating}
          sortBy={sortBy} sortDir={sortDir}
          onSortChange={(col) => handleFilterChange({ sortBy: col, sortDir: col === sortBy && sortDir === "desc" ? "asc" : "desc", page: "1" })}
          selectedIds={selectedIds} onSelectionChange={setSelectedIds}
          sections={sections}
          onSectionChange={(productId, sectionId) =>
            sectionFetcher.submit({ intent: "set-section", productId, sectionId: sectionId ?? "" }, { method: "POST" })
          }
        />
        {quickAdd && quickAddData && (
          <QuickAddPopover
            anchorEl={quickAdd.anchorEl} data={quickAddData} consignors={consignors}
            onSubmit={(fields) => addFetcher.submit(fields, { method: "POST" })}
            onClose={() => setQuickAdd(null)} isSubmitting={addLoading}
          />
        )}
        <Pagination page={page} totalPages={totalPages} onPageChange={(p) => handleFilterChange({ page: String(p) })} total={total} limit={25} />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
