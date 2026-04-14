import { useState, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { groupByProduct } from "./helpers";
import type { ListingRow, ProductGroup } from "./helpers";
import type { loader } from "~/routes/portal.listings";

export function useInfiniteScroll(
  serverGroups: ProductGroup[],
  page: number,
  totalPages: number,
  statusFilter: string,
  showInactive: boolean,
  initialSearch: string,
  searchParams: URLSearchParams,
) {
  const [mobileGroups, setMobileGroups] = useState<ProductGroup[]>(serverGroups);
  const [mobileLoading, setMobileLoading] = useState(false);
  const mobilePage = useRef(page);
  const scrollSentinel = useRef<HTMLDivElement>(null);
  const loadMoreFetcher = useFetcher<typeof loader>();

  // Reset when filters change
  useEffect(() => {
    setMobileGroups(serverGroups);
    mobilePage.current = page;
  }, [statusFilter, showInactive, initialSearch]);

  // Append new groups
  useEffect(() => {
    if (loadMoreFetcher.data && loadMoreFetcher.state === "idle") {
      const newGroups = groupByProduct(loadMoreFetcher.data.listings as unknown as ListingRow[]);
      setMobileGroups((prev) => {
        const existingIds = new Set(prev.map((g) => g.productId));
        return [...prev, ...newGroups.filter((g) => !existingIds.has(g.productId))];
      });
      setMobileLoading(false);
      mobileLoadingRef.current = false;
    }
  }, [loadMoreFetcher.data, loadMoreFetcher.state]);

  const totalPagesRef = useRef(totalPages);
  const mobileLoadingRef = useRef(false);
  const searchParamsRef = useRef(searchParams);
  totalPagesRef.current = totalPages;
  searchParamsRef.current = searchParams;

  // Intersection Observer
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const el = scrollSentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && mobilePage.current < totalPagesRef.current && !mobileLoadingRef.current) {
          mobilePage.current++;
          mobileLoadingRef.current = true;
          setMobileLoading(true);
          const params = new URLSearchParams(searchParamsRef.current);
          params.set("page", String(mobilePage.current));
          loadMoreFetcher.load(`/portal/listings?${params.toString()}`);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { mobileGroups, mobileLoading, scrollSentinel };
}
