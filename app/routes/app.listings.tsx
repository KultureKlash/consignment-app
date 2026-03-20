import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { cancelListing, bulkCancelListings, createListing } from "~/services/listings.server";
import prisma from "~/db.server";
import { queryListings } from "~/services/listing-queries.server";
import ListingsFilter from "~/components/ListingsFilter";
import ListingsTable from "~/components/ListingsTable";
import Pagination from "~/components/Pagination";
import QuickAddPopover from "~/components/QuickAddPopover";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // One-time backfill: fetch image URLs from Shopify for products missing them
  const { backfillProductImages } = await import("~/services/shopify-products.server");
  await backfillProductImages(admin);

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const status = url.searchParams.get("status") ?? "active";
  const category = url.searchParams.get("category") ?? "";
  const consignorId = url.searchParams.get("consignorId") ?? "";
  const sortBy = (url.searchParams.get("sortBy") as "date" | "price" | "status") || "date";
  const sortDir = (url.searchParams.get("sortDir") as "asc" | "desc") || "desc";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const [result, consignors] = await Promise.all([
    queryListings({
      search: search || undefined,
      status: status && status !== "all" ? status : undefined,
      category: category || undefined,
      consignorId: consignorId || undefined,
      sortBy,
      sortDir,
      page,
      limit: 25,
      grouped: true,
    }),
    prisma.consignor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return { ...result, consignors, filters: { search, status, category, consignorId }, sortBy, sortDir };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "cancel") {
      const listing = await cancelListing({
        admin,
        listingId: formData.get("listingId") as string,
      });
      return { listing, intent };
    }

    if (intent === "bulk-cancel") {
      const ids = (formData.get("listingIds") as string).split(",").filter(Boolean);
      const result = await bulkCancelListings({ admin, listingIds: ids });
      return {
        cancelled: result.cancelled,
        syncErrors: result.errors,
        intent,
      };
    }

    if (intent === "quick-add") {
      const title = formData.get("title") as string;
      const size = formData.get("size") as string;
      const price = Number(formData.get("price"));
      const consignorId = formData.get("consignorId") as string;
      if (!title || !size || !price || !consignorId) {
        throw new Error("Missing required fields");
      }
      const quantity = Math.max(1, Math.min(50, Number(formData.get("quantity")) || 1));
      const listing = await createListing({
        admin,
        title,
        brand: (formData.get("brand") as string) || undefined,
        category: (formData.get("category") as string) || undefined,
        styleId: (formData.get("styleId") as string) || undefined,
        size,
        gtin: (formData.get("gtin") as string) || undefined,
        price,
        count: quantity,
        consignorId,
      });
      return { listing, intent, quantity };
    }

    throw new Error("Invalid intent");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message, intent };
  }
};

export default function Listings() {
  const { listings, total, page, totalPages, consignors, filters, sortBy, sortDir } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const cancelFetcher = useFetcher();
  const addFetcher = useFetcher();
  const shopify = useAppBridge();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quickAdd, setQuickAdd] = useState<{ productId: string; anchorEl: HTMLElement } | null>(null);

  const isNavigating = navigation.state === "loading";
  const cancelLoading = ["loading", "submitting"].includes(cancelFetcher.state);
  const addLoading = ["loading", "submitting"].includes(addFetcher.state);

  // Clear selection on page/filter change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [listings]);

  useEffect(() => {
    const data = cancelFetcher.data as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.error) {
      shopify.toast.show(data.error as string);
    } else if (data.intent === "cancel") {
      shopify.toast.show("Listing cancelled");
    } else if (data.intent === "bulk-cancel") {
      const count = data.cancelled as number;
      const syncErrors = (data.syncErrors as string[]) ?? [];
      const msg = `Cancelled ${count} listing${count !== 1 ? "s" : ""}`;
      shopify.toast.show(syncErrors.length > 0 ? `${msg} (Shopify sync had ${syncErrors.length} error${syncErrors.length !== 1 ? "s" : ""} — will retry)` : msg);
      setSelectedIds(new Set());
    }
  }, [cancelFetcher.data, shopify]);

  // Quick-add toast
  useEffect(() => {
    const data = addFetcher.data as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.error) {
      shopify.toast.show(data.error as string);
    } else if (data.intent === "quick-add") {
      const qty = (data.quantity as number) ?? 1;
      shopify.toast.show(`Added ${qty} listing${qty !== 1 ? "s" : ""}`);
      setQuickAdd(null);
    }
  }, [addFetcher.data, shopify]);

  const handleFilterChange = (params: Record<string, string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(params)) {
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
      }
      return next;
    });
  };

  const handleCancel = (listingId: string) => {
    cancelFetcher.submit({ intent: "cancel", listingId }, { method: "POST" });
  };

  const handleBulkCancel = () => {
    if (selectedIds.size === 0) return;
    cancelFetcher.submit(
      { intent: "bulk-cancel", listingIds: Array.from(selectedIds).join(",") },
      { method: "POST" },
    );
  };

  const handlePageChange = (newPage: number) => {
    handleFilterChange({ page: String(newPage) });
  };

  const handleSortChange = (column: "date" | "price" | "status") => {
    const newDir = column === sortBy && sortDir === "desc" ? "asc" : "desc";
    handleFilterChange({ sortBy: column, sortDir: newDir, page: "1" });
  };

  const handleQuickAdd = (productId: string, anchorEl: HTMLElement) => {
    setQuickAdd({ productId, anchorEl });
  };

  const handleQuickAddSubmit = (fields: Record<string, string>) => {
    addFetcher.submit(fields, { method: "POST" });
  };

  // Build quick-add data from the product group
  const quickAddData = (() => {
    if (!quickAdd) return null;
    const groupListing = listings.find((l) => l.variant.product.id === quickAdd.productId);
    if (!groupListing) return null;
    const product = groupListing.variant.product;
    // Deduplicate variants from all listings of this product
    const variantMap = new Map<string, { size: string; gtin: string | null }>();
    for (const l of listings) {
      if (l.variant.product.id === quickAdd.productId && !variantMap.has(l.variant.size)) {
        variantMap.set(l.variant.size, { size: l.variant.size, gtin: l.variant.gtin });
      }
    }
    return {
      productId: quickAdd.productId,
      title: product.title,
      brand: product.brand,
      styleId: product.styleId,
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
          search={filters.search}
          status={filters.status}
          category={filters.category}
          consignorId={filters.consignorId}
          consignors={consignors}
          onFilterChange={handleFilterChange}
        />

        {/* Bulk action bar */}
        {selectedIds.size > 0 ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 8px 8px 16px",
            background: "#fff",
            border: "1px solid rgba(227,227,227,0.6)",
            borderRadius: "10px",
            marginBottom: "12px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>
                {selectedIds.size} selected
              </span>
              {(() => {
                const activeIds = listings.filter((l) => l.status === "active").map((l) => l.id);
                const allSelected = activeIds.length > 0 && activeIds.every((id) => selectedIds.has(id));
                return !allSelected && activeIds.length > selectedIds.size ? (
                  <span
                    onClick={() => setSelectedIds(new Set(activeIds))}
                    style={{
                      fontSize: "12px",
                      color: "#6d7175",
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#1a1a1a"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "#6d7175"; }}
                  >
                    Select all ({activeIds.length})
                  </span>
                ) : null;
              })()}
              <span
                onClick={() => setSelectedIds(new Set())}
                style={{
                  fontSize: "12px",
                  color: "#9ca3af",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#6d7175"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#9ca3af"; }}
              >
                Clear
              </span>
            </div>
            <button
              onClick={handleBulkCancel}
              disabled={cancelLoading}
              style={{
                padding: "7px 16px",
                fontSize: "12px",
                fontWeight: 600,
                borderRadius: "10px",
                border: "none",
                background: cancelLoading ? "#374151" : "#111827",
                color: "#fff",
                cursor: cancelLoading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => { if (!cancelLoading) { e.currentTarget.style.background = "#374151"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)"; } }}
              onMouseLeave={(e) => { if (!cancelLoading) { e.currentTarget.style.background = "#111827"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; } }}
            >
              {cancelLoading ? "Cancelling..." : "Cancel selected"}
            </button>
          </div>
        ) : null}

        <ListingsTable
          listings={listings}
          grouped
          onCancel={handleCancel}
          onQuickAdd={handleQuickAdd}
          isLoading={cancelLoading}
          isNavigating={isNavigating}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />

        {quickAdd && quickAddData && (
          <QuickAddPopover
            anchorEl={quickAdd.anchorEl}
            data={quickAddData}
            consignors={consignors}
            onSubmit={handleQuickAddSubmit}
            onClose={() => setQuickAdd(null)}
            isSubmitting={addLoading}
          />
        )}
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          total={total}
          limit={25}
        />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
