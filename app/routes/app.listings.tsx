import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { cancelListing } from "~/services/listings.server";
import prisma from "~/db.server";
import { queryListings } from "~/services/listing-queries.server";
import ListingsFilter from "~/components/ListingsFilter";
import ListingsTable from "~/components/ListingsTable";
import Pagination from "~/components/Pagination";

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
  const shopify = useAppBridge();

  const isNavigating = navigation.state === "loading";
  const cancelLoading = ["loading", "submitting"].includes(cancelFetcher.state);

  useEffect(() => {
    const data = cancelFetcher.data as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.error) {
      shopify.toast.show(data.error as string);
    } else if (data.intent === "cancel") {
      shopify.toast.show("Listing cancelled");
    }
  }, [cancelFetcher.data, shopify]);

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

  const handlePageChange = (newPage: number) => {
    handleFilterChange({ page: String(newPage) });
  };

  const handleSortChange = (column: "date" | "price" | "status") => {
    const newDir = column === sortBy && sortDir === "desc" ? "asc" : "desc";
    handleFilterChange({ sortBy: column, sortDir: newDir, page: "1" });
  };

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
        <ListingsTable
          listings={listings}
          grouped
          onCancel={handleCancel}
          isLoading={cancelLoading}
          isNavigating={isNavigating}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
        />
        <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
