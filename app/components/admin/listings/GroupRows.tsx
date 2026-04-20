import { useState, useCallback } from "react";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import type { ProductGroup, SortKey } from "./types";
import { useListingActions } from "./ListingActionsContext";
import { GroupRowsMobile } from "./GroupRowsMobile";
import { GroupRowsDesktop } from "./GroupRowsDesktop";

export function GroupRows({
  group,
  isExpanded,
  onToggle,
  colCount,
  hasSelection,
  renderMode,
}: {
  group: ProductGroup;
  isExpanded: boolean;
  onToggle: () => void;
  colCount: number;
  hasSelection: boolean;
  renderMode?: "desktop" | "mobile";
}) {
  const { selectedIds } = useListingActions();
  const [localSortKey, setLocalSortKey] = useState<SortKey | null>(null);
  const [localSortDir, setLocalSortDir] = useState<"asc" | "desc">("asc");
  const [localSectionId, setLocalSectionId] = useState<string>(group.sectionId ?? "");

  const handleLocalSort = (key: SortKey) => {
    if (localSortKey === key) {
      setLocalSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setLocalSortKey(key);
      setLocalSortDir("asc");
    }
  };

  const sortedListings = localSortKey
    ? [...group.listings].sort((a, b) => {
        let cmp = 0;
        if (localSortKey === "price") cmp = Number(a.price) - Number(b.price);
        else if (localSortKey === "status") cmp = a.status.localeCompare(b.status);
        else if (localSortKey === "date") cmp = new Date(a.listedAt ?? a.createdAt).getTime() - new Date(b.listedAt ?? b.createdAt).getTime();
        return localSortDir === "asc" ? cmp : -cmp;
      })
    : group.listings;

  const groupSelectableIds = group.listings.filter((l) => [LISTING_STATUS.SUBMITTED, LISTING_STATUS.APPROVED, LISTING_STATUS.ACTIVE].includes(l.status)).map((l) => l.id);
  const allGroupSelected = hasSelection && groupSelectableIds.length > 0 && groupSelectableIds.every((id) => selectedIds?.has(id));

  const scrollRef = useCallback((node: HTMLTableRowElement | null) => {
    if (node) {
      setTimeout(() => node.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  }, []);

  const shared = { group, isExpanded, onToggle, hasSelection, sortedListings, groupSelectableIds, allGroupSelected };

  if (renderMode === "mobile") {
    return <GroupRowsMobile {...shared} />;
  }

  return (
    <GroupRowsDesktop
      {...shared}
      colCount={colCount}
      localSortKey={localSortKey}
      localSortDir={localSortDir}
      handleLocalSort={handleLocalSort}
      localSectionId={localSectionId}
      setLocalSectionId={setLocalSectionId}
      scrollRef={scrollRef}
    />
  );
}
