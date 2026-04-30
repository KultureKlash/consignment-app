import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "~/db.server";
import { queryListings } from "~/services/listings";
import { handleListingAction } from "~/services/admin/listing-actions.server";
import { LISTING_BUCKETS, type ListingBucket } from "~/lib/domain";
import type { Prisma } from "@prisma/client";
import { CATEGORIES } from "~/lib/categories";
import { useListingToasts } from "~/components/admin/listings/useListingToasts";
import ListingsFilter from "~/components/admin/ListingsFilter";
import StatusTabs from "~/components/admin/listings/StatusTabs";
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
  const tabParam = url.searchParams.get("tab") ?? "active";
  const tab: ListingBucket = (tabParam in LISTING_BUCKETS ? tabParam : "active") as ListingBucket;
  const category = url.searchParams.get("category") ?? "";
  const consignorId = url.searchParams.get("consignorId") ?? "";
  const sortBy = (url.searchParams.get("sortBy") as "date" | "price" | "status") || "date";
  const sortDir = (url.searchParams.get("sortDir") as "asc" | "desc") || "desc";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const sectionId = url.searchParams.get("sectionId") ?? "";

  // Build the same WHERE conditions as queryListings, MINUS status — used for bucket counts
  const countConditions: Prisma.ListingWhereInput[] = [];
  if (search) {
    countConditions.push({
      OR: [
        { consignor: { name: { contains: search, mode: "insensitive" } } },
        { variant: { product: { title: { contains: search, mode: "insensitive" } } } },
        { variant: { product: { sku: { contains: search, mode: "insensitive" } } } },
      ],
    });
  }
  if (category) {
    const subcats = CATEGORIES[category];
    if (subcats) {
      countConditions.push({ variant: { product: { category: { in: [category, ...subcats] } } } });
    } else {
      countConditions.push({ variant: { product: { category } } });
    }
  }
  if (consignorId) countConditions.push({ consignorId });
  if (sectionId) countConditions.push({ variant: { product: { sectionId } } });
  const countWhere: Prisma.ListingWhereInput = countConditions.length > 0 ? { AND: countConditions } : {};

  const [result, consignors, sections, statusCounts] = await Promise.all([
    queryListings({
      search: search || undefined,
      statuses: LISTING_BUCKETS[tab],
      category: category || undefined,
      consignorId: consignorId || undefined,
      sectionId: sectionId || undefined,
      sortBy, sortDir, page, limit: 25, grouped: true,
    }),
    prisma.consignor.findMany({ select: { id: true, name: true, storeOwned: true }, orderBy: { name: "asc" } }),
    prisma.storeSection.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    prisma.listing.groupBy({ by: ["status"], where: countWhere, _count: true }),
  ]);

  const bucketCounts: Record<ListingBucket, number> = { active: 0, action_needed: 0, sold: 0, archive: 0 };
  for (const row of statusCounts) {
    for (const [bucket, statuses] of Object.entries(LISTING_BUCKETS) as [ListingBucket, readonly string[]][]) {
      if (statuses.includes(row.status)) {
        bucketCounts[bucket] += row._count;
        break;
      }
    }
  }

  return { ...result, consignors, sections, bucketCounts, filters: { search, tab, category, consignorId, sectionId }, sortBy, sortDir };
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
  const { listings, total, page, totalPages, consignors, sections, bucketCounts, filters, sortBy, sortDir } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const cancelFetcher = useFetcher();
  const addFetcher = useFetcher();
  const approvalFetcher = useFetcher();
  const sectionFetcher = useFetcher();
  const syncFetcher = useFetcher();
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

  const buildTabUrl = (tab: ListingBucket) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "active") next.delete("tab"); else next.set("tab", tab);
    next.delete("page");
    const qs = next.toString();
    return `/app/listings${qs ? `?${qs}` : ""}`;
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
        <StatusTabs activeTab={filters.tab} bucketCounts={bucketCounts} buildTabUrl={buildTabUrl} />
        <ListingsFilter
          search={filters.search} category={filters.category}
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
          onDenyWithdrawal={(id) => submitApproval("deny-withdrawal", { listingId: id })}
          onCompleteWithdrawal={(id) => submitApproval("complete-withdrawal", { listingId: id })}
          onRetrySync={(id) => syncFetcher.submit({ intent: "retry-sync", listingId: id }, { method: "POST" })}
          syncingListingId={syncFetcher.state !== "idle" ? (syncFetcher.formData?.get("listingId") as string) : undefined}
          onEditApprove={(id, fields: EditApproveFields) => submitApproval("admin-edit-approve", { listingId: id, ...fields })}
          onAdminEdit={(id, fields: EditApproveFields) => {
            const d: Record<string, string> = { listingId: id, ...fields };
            if (!fields.cost) delete d.cost;
            submitApproval("admin-edit", d);
          }}
          onUpdateCost={(listingId, cost) => {
            sectionFetcher.submit({ intent: "update-cost", listingId, cost }, { method: "POST" });
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
