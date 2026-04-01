import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useRouteLoaderData, useFetcher, Link, useSearchParams } from "react-router";
import { redirect } from "react-router";
import { Plus, Package, Trash2, Pencil, Search, Eye, EyeOff, ChevronDown, ChevronRight, PackageX, ArrowLeft, ExternalLink } from "lucide-react";
import { InfoTip } from "~/components/portal/InfoTip";
import { AppHeader } from "~/components/portal/AppHeader";
import { fmt } from "~/lib/currency";
import { authenticatePortal } from "~/services/portal/auth.server";
import { deleteSubmittedListing, updateActiveListingPrice, requestWithdrawal } from "~/services/submission.server";
import prisma from "~/db.server";
import type { loader as portalLoader } from "./portal";

const ACTIVE_STATUSES = ["submitted", "approved_awaiting_dropoff", "active", "pending_sale"];
const INACTIVE_STATUSES = ["sold", "cancelled", "rejected", "withdrawal_requested", "pending_pickup", "withdrawn"];

export async function loader({ request }: LoaderFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") ?? "all";
  const showInactive = url.searchParams.get("inactive") === "1";
  const search = url.searchParams.get("search")?.trim() ?? "";

  // Build where clause
  const where: Record<string, unknown> = { consignorId: consignor.id };

  if (statusFilter === "withdrawals") {
    where.status = { in: ["withdrawal_requested", "pending_pickup", "withdrawn"] };
  } else if (statusFilter !== "all") {
    where.status = statusFilter;
  } else if (!showInactive) {
    // "All" without inactive = only active statuses
    where.status = { in: ACTIVE_STATUSES };
  }

  // Search filter
  if (search) {
    where.AND = [
      {
        OR: [
          { variant: { product: { title: { contains: search } } } },
          { variant: { product: { brand: { contains: search } } } },
          { variant: { product: { styleId: { contains: search } } } },
          { variant: { size: { contains: search } } },
        ],
      },
    ];
  }

  const listings = await prisma.listing.findMany({
    where,
    include: {
      variant: { include: { product: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Count by status for tabs
  const counts = await prisma.listing.groupBy({
    by: ["status"],
    where: { consignorId: consignor.id },
    _count: true,
  });
  const statusCounts: Record<string, number> = {};
  for (const c of counts) {
    statusCounts[c.status] = c._count;
  }

  // Lowest active price per variant (across ALL consignors)
  const variantIds = [...new Set(listings.map((l) => l.variantId))];
  const lowestPrices: Record<string, number> = {};
  if (variantIds.length > 0) {
    const mins = await prisma.listing.groupBy({
      by: ["variantId"],
      where: { variantId: { in: variantIds }, status: "active" },
      _min: { price: true },
    });
    for (const m of mins) {
      if (m._min.price != null) lowestPrices[m.variantId] = m._min.price;
    }
  }

  return { consignor, listings, statusCounts, statusFilter, showInactive, search, lowestPrices };
}

export async function action({ request }: ActionFunctionArgs) {
  const { portalFormRateLimit } = await import("~/lib/rate-limit.server");
  const limited = portalFormRateLimit(request);
  if (limited) return limited;

  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "delete") {
    const listingId = formData.get("listingId") as string;
    await deleteSubmittedListing({ listingId, consignorId: consignor.id });
    return { ok: true };
  }

  if (intent === "update-price") {
    const listingId = formData.get("listingId") as string;
    const price = parseFloat(formData.get("price") as string);
    if (!listingId || isNaN(price) || price <= 0) {
      return { error: "Invalid price" };
    }
    await updateActiveListingPrice({ listingId, consignorId: consignor.id, price });
    return { ok: true };
  }

  if (intent === "request-withdrawal") {
    const listingId = formData.get("listingId") as string;
    if (!listingId) return { error: "Missing listing ID" };
    await requestWithdrawal({ listingId, consignorId: consignor.id });
    return { ok: true };
  }

  return { error: "Invalid intent" };
}

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  approved_awaiting_dropoff: "Awaiting Drop-off",
  active: "Active",
  pending_sale: "Pending Sale",
  sold: "Sold",
  cancelled: "Cancelled",
  rejected: "Rejected",
  withdrawal_requested: "Withdrawal Requested",
  pending_pickup: "Pending Pickup",
  withdrawn: "Withdrawn",
};

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-violet-500/15 text-violet-400",
  approved_awaiting_dropoff: "bg-blue-400/15 text-blue-400",
  active: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]",
  pending_sale: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  sold: "bg-primary/15 text-primary",
  cancelled: "bg-muted-foreground/15 text-muted-foreground",
  rejected: "bg-red-500/15 text-red-400",
  withdrawal_requested: "bg-orange-500/15 text-orange-400",
  pending_pickup: "bg-cyan-500/15 text-cyan-400",
  withdrawn: "bg-muted-foreground/15 text-muted-foreground",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function InlinePrice({ listingId, price, editable }: { listingId: string; price: number; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(price.toFixed(2));
  const inputRef = useRef<HTMLInputElement>(null);
  const fetcher = useFetcher();
  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.select();
    }
  }, [editing]);

  // Reset after successful save
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      setEditing(false);
    }
  }, [fetcher.state, fetcher.data]);

  // Sync value when price changes from server
  useEffect(() => {
    if (!editing) setValue(price.toFixed(2));
  }, [price, editing]);

  if (!editable) {
    return <span className="font-medium tabular-nums">${fmt(price)}</span>;
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="font-medium tabular-nums cursor-pointer hover:text-[hsl(var(--cta))] transition-colors"
        title="Click to edit price"
      >
        ${fmt(price)}
      </button>
    );
  }

  const handleSubmit = () => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed <= 0) {
      setValue(price.toFixed(2));
      setEditing(false);
      return;
    }
    if (parsed === price) {
      setEditing(false);
      return;
    }
    fetcher.submit(
      { intent: "update-price", listingId, price: parsed.toFixed(2) },
      { method: "POST" },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") { setValue(price.toFixed(2)); setEditing(false); }
  };

  return (
    <div className="inline-flex items-center gap-1">
      <span className="text-muted-foreground text-xs">$</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        pattern="[0-9]*\.?[0-9]*"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSubmit}
        disabled={isSaving}
        className="w-20 bg-white/[0.08] border border-white/[0.15] rounded-md px-2 py-0.5 text-sm tabular-nums focus:border-[hsl(var(--cta))]/50 focus:outline-none focus:ring-1 focus:ring-[hsl(var(--cta))]/30 transition-colors"
      />
      {isSaving && <span className="text-[10px] text-muted-foreground animate-pulse">...</span>}
    </div>
  );
}

type ListingRow = {
  id: string;
  price: number;
  status: string;
  createdAt: string | Date;
  variantId: string;
  variant: {
    size: string;
    gtin: string | null;
    product: { id: string; title: string; brand: string | null; imageUrl: string | null; styleId: string | null };
  };
};

type ProductGroup = {
  productId: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  listings: ListingRow[];
};

function groupByProduct(listings: ListingRow[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();
  for (const l of listings) {
    const pid = l.variant.product.id;
    let group = map.get(pid);
    if (!group) {
      group = {
        productId: pid,
        title: l.variant.product.title,
        brand: l.variant.product.brand,
        imageUrl: l.variant.product.imageUrl,
        listings: [],
      };
      map.set(pid, group);
    }
    group.listings.push(l);
  }
  return Array.from(map.values());
}

const NOT_YET_LISTED = new Set(["submitted", "approved_awaiting_dropoff"]);

function daysListedLabel(createdAt: string | Date, status: string): string {
  if (NOT_YET_LISTED.has(status)) return "—";
  const d = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
  return d === 0 ? "Today" : `${d}d`;
}

const TABS = [
  { key: "all", label: "All", dotColor: "" },
  { key: "active", label: "Active", dotColor: "bg-[hsl(var(--success))]/60 shadow-[0_0_6px_hsl(152_60%_52%/0.4)]" },
  { key: "submitted", label: "Pending", dotColor: "bg-amber-400/60 shadow-[0_0_6px_rgba(251,191,36,0.4)]" },
  { key: "approved_awaiting_dropoff", label: "Awaiting", dotColor: "bg-blue-400/60 shadow-[0_0_6px_rgba(96,165,250,0.4)]" },
  { key: "withdrawals", label: "Withdrawals", dotColor: "bg-orange-400/60 shadow-[0_0_6px_rgba(251,146,60,0.4)]" },
];

export default function PortalListings() {
  const { consignor, listings, statusCounts, statusFilter, showInactive, search: initialSearch, lowestPrices } = useLoaderData<typeof loader>();
  const parentData = useRouteLoaderData<typeof portalLoader>("routes/portal");
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState(initialSearch);
  const groups = groupByProduct(listings as unknown as ListingRow[]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [mobileDetail, setMobileDetail] = useState<string | null>(null);

  const toggleGroup = (productId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  // Sync search from URL
  useEffect(() => {
    setSearchValue(initialSearch);
  }, [initialSearch]);

  // Debounced search
  useEffect(() => {
    if (searchValue === initialSearch) return;
    const timer = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (searchValue) {
          next.set("search", searchValue);
        } else {
          next.delete("search");
        }
        return next;
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchValue]);

  const handleDelete = (listingId: string) => {
    fetcher.submit({ intent: "delete", listingId }, { method: "POST" });
    setConfirmDelete(null);
  };

  const handleWithdraw = (listingId: string) => {
    fetcher.submit({ intent: "request-withdrawal", listingId }, { method: "POST" });
    setConfirmWithdraw(null);
  };

  const buildTabUrl = (tabKey: string) => {
    const params = new URLSearchParams();
    if (tabKey !== "all") params.set("status", tabKey);
    if (showInactive) params.set("inactive", "1");
    if (searchValue) params.set("search", searchValue);
    const qs = params.toString();
    return `/portal/listings${qs ? `?${qs}` : ""}`;
  };

  const toggleInactive = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (showInactive) {
        next.delete("inactive");
      } else {
        next.set("inactive", "1");
      }
      return next;
    });
  };

  const activeCount = ACTIVE_STATUSES.reduce((s, k) => s + (statusCounts[k] ?? 0), 0);
  const totalCount = Object.values(statusCounts).reduce((s, c) => s + c, 0);

  return (
    <div>
      <AppHeader title="My Listings" subtitle="Track and manage your consignment items" consignorName={consignor.name} avatarColor={parentData?.consignor?.avatarColor} notifications={parentData?.notifications} />

      <div className="px-4 md:px-8 pb-8 space-y-4 md:space-y-6">
        {/* Header + New Listing Button */}
        <div className="flex items-center justify-between animate-slide-up">
          <div />
          <Link
            to="/portal/listings/new"
            className="btn-cta inline-flex items-center gap-2 px-4 py-2.5 text-sm"
          >
            <Plus className="w-4 h-4" />
            Submit New Listing
          </Link>
        </div>

        {/* Status tabs + count */}
        <div className="animate-slide-up" style={{ animationDelay: "80ms" }}>
          <div className="glass-panel rounded-2xl p-1.5 flex items-center md:flex-1 overflow-x-auto glass-scrollbar">
            {TABS.map((tab) => {
              const isActive = statusFilter === tab.key || (tab.key === "all" && statusFilter === "all");
              const count = tab.key === "all"
                ? (showInactive ? totalCount : activeCount)
                : tab.key === "withdrawals"
                  ? (statusCounts["withdrawal_requested"] ?? 0) + (statusCounts["pending_pickup"] ?? 0) + (statusCounts["withdrawn"] ?? 0)
                  : (statusCounts[tab.key] ?? 0);
              return (
                <Link
                  key={tab.key}
                  to={buildTabUrl(tab.key)}
                  className={`shrink-0 md:shrink md:flex-1 px-2.5 md:px-0 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1 md:gap-1.5 cursor-pointer ${
                    isActive
                      ? "bg-white/[0.12] text-foreground shadow-[inset_0_0_12px_-4px_rgba(255,255,255,0.1)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
                  }`}
                >
                  {tab.dotColor && <span className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full shrink-0 ${tab.dotColor}`} />}
                  <span className="whitespace-nowrap">{tab.label}</span>
                  {count > 0 && (
                    <span className={`text-[10px] tabular-nums rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1 shrink-0 ${
                      isActive ? "bg-white/[0.12] text-foreground" : "bg-white/[0.06] text-muted-foreground"
                    }`}>
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={toggleInactive}
          className="flex items-center gap-2.5 cursor-pointer animate-slide-up"
          style={{ animationDelay: "120ms" }}
        >
          <div className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 ${showInactive ? "bg-white/25" : "bg-white/10"}`}>
            <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full shadow-sm transition-transform duration-200 ${showInactive ? "translate-x-[18px] bg-white" : "translate-x-0 bg-white/50"}`} />
          </div>
          {showInactive ? <Eye className="w-3.5 h-3.5 text-muted-foreground" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground">Show inactive products</span>
        </button>

        {/* Search */}
        <div className="relative animate-slide-up" style={{ animationDelay: "160ms" }}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search by product name, size, or SKU"
            className="glass-input w-full pl-10 pr-3 py-2.5 rounded-xl text-sm"
          />
        </div>

        {/* Listings */}
        {listings.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center animate-slide-up" style={{ animationDelay: "160ms" }}>
            <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">No listings found.</p>
            <p className="text-xs text-muted-foreground mt-1">Submit a new listing to get started.</p>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "160ms" }}>
            {/* Desktop table */}
            <div className="hidden md:block">
              {groups.map((group) => {
                const isOpen = expandedGroups.has(group.productId);

                return (
                  <div key={group.productId} className={isOpen ? "border-b border-[rgba(255,255,255,0.06)]" : "border-b border-[rgba(255,255,255,0.04)]"}>
                    <div className="relative">
                      <button
                        onClick={() => toggleGroup(group.productId)}
                        className="w-full flex items-center gap-3 px-6 py-3 pr-12 text-sm hover:bg-white/[0.03] transition-colors cursor-pointer"
                      >
                        {isOpen
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        }
                        {group.imageUrl ? (
                          <img src={group.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover border border-[rgba(255,255,255,0.08)] shrink-0" />
                        ) : (
                          <span className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-muted-foreground" />
                          </span>
                        )}
                        <div className="min-w-0 text-left">
                          <div className="truncate font-medium leading-tight">{group.title}</div>
                          {group.brand && <div className="truncate text-[11px] text-muted-foreground leading-tight">{group.brand}</div>}
                        </div>
                        <span className="shrink-0 ml-auto text-xs text-muted-foreground tabular-nums mr-2">
                          {group.listings.length} item{group.listings.length !== 1 ? "s" : ""}
                        </span>
                      </button>
                      <Link
                        to={`/portal/listings/new?productId=${group.productId}`}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
                        title="Add another"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                    {isOpen && (<>
                      <div className="grid grid-cols-[1fr_1.5fr_1.5fr_1.5fr_1fr_auto] px-6 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-[rgba(255,255,255,0.06)] bg-white/[0.02] items-center">
                        <span className="pl-6">Size</span>
                        <span className="flex justify-center items-center gap-1">Your Price <InfoTip text="Click on a price to modify it" /></span>
                        <span className="flex justify-center">Lowest</span>
                        <span className="flex justify-center">Status</span>
                        <span className="flex justify-center">Listed</span>
                        <span className="w-14" />
                      </div>
                      {group.listings.map((listing, i) => (
                      <div key={listing.id} className={`grid grid-cols-[1fr_1.5fr_1.5fr_1.5fr_1fr_auto] px-6 py-2.5 text-sm items-center bg-white/[0.02] ${i < group.listings.length - 1 ? "border-b border-[rgba(255,255,255,0.03)]" : ""}`}>
                        <span className="pl-6 text-muted-foreground">{listing.variant.size}</span>
                        <div className="flex justify-center">
                          <InlinePrice listingId={listing.id} price={listing.price} editable={listing.status === "active" || listing.status === "approved_awaiting_dropoff"} />
                        </div>
                        <span className="flex justify-center text-xs text-muted-foreground tabular-nums">
                          {lowestPrices[listing.variantId] != null ? `$${fmt(lowestPrices[listing.variantId])}` : "—"}
                        </span>
                        <div className="flex justify-center"><StatusBadge status={listing.status} /></div>
                        <span className="flex justify-center text-xs text-muted-foreground tabular-nums">
                          {daysListedLabel(listing.createdAt, listing.status)}
                        </span>
                        <div className="w-14 flex justify-center gap-1">
                          {listing.status === "submitted" && (
                            <>
                              <Link to={`/portal/listings/${listing.id}/edit`} className="p-1 rounded hover:bg-white/[0.08] transition-colors text-muted-foreground hover:text-foreground" title="Edit">
                                <Pencil className="w-3.5 h-3.5" />
                              </Link>
                              <button onClick={() => setConfirmDelete(listing.id)} className="p-1 rounded hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400 cursor-pointer" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {listing.status === "active" && (
                            <button onClick={() => setConfirmWithdraw(listing.id)} className="p-1 rounded hover:bg-orange-500/10 transition-colors text-muted-foreground hover:text-orange-400 cursor-pointer" title="Request Withdrawal">
                              <PackageX className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      ))}
                    </>)}
                  </div>
                );
              })}
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[rgba(255,255,255,0.06)]">
              {groups.map((group) => {
                const isOpen = expandedGroups.has(group.productId);

                return (
                  <div key={group.productId}>
                    <div className="relative">
                      <button
                        onClick={() => toggleGroup(group.productId)}
                        className="w-full flex items-center gap-2.5 px-4 pr-10 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
                      >
                        {isOpen
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        }
                        {group.imageUrl ? (
                          <img src={group.imageUrl} alt="" className="w-11 h-11 rounded-lg object-cover border border-[rgba(255,255,255,0.08)] shrink-0" />
                        ) : (
                          <span className="w-11 h-11 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-muted-foreground" />
                          </span>
                        )}
                        <div className="flex-1 min-w-0 text-left">
                          <div className="truncate text-sm font-medium">{group.title}</div>
                          {group.brand && <div className="truncate text-[11px] text-muted-foreground">{group.brand}</div>}
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {group.listings.length} item{group.listings.length !== 1 ? "s" : ""}
                        </span>
                      </button>
                      <Link
                        to={`/portal/listings/new?productId=${group.productId}`}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
                        title="Add another"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                    {isOpen && group.listings.map((listing) => (
                      <div key={listing.id} onClick={() => setMobileDetail(listing.id)} className="flex items-center gap-2 pl-8 pr-4 py-3 bg-white/[0.02] border-t border-[rgba(255,255,255,0.04)] cursor-pointer active:bg-white/[0.06] transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-foreground">Size {listing.variant.size}</span>
                            <span className="shrink-0 ml-2 text-sm font-bold tabular-nums">${fmt(listing.price)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {daysListedLabel(listing.createdAt, listing.status)}
                            </span>
                            <StatusBadge status={listing.status} />
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="glass-panel-strong rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-2">Delete Listing?</h3>
            <p className="text-sm text-muted-foreground mb-4">This will permanently remove this submitted listing. This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw confirmation modal */}
      {confirmWithdraw && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setConfirmWithdraw(null)}>
          <div className="glass-panel-strong rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-2">Withdraw Listing?</h3>
            <p className="text-sm text-muted-foreground mb-4">This will remove the item from the store immediately. An admin will process your withdrawal request.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmWithdraw(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleWithdraw(confirmWithdraw)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 transition-colors cursor-pointer"
              >
                Withdraw
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile listing detail drawer */}
      {mobileDetail && typeof document !== "undefined" && (() => {
        const allListings = listings as unknown as ListingRow[];
        const listing = allListings.find((l) => l.id === mobileDetail);
        if (!listing) return null;
        const product = listing.variant.product;
        const lowest = lowestPrices[listing.variantId];
        const daysLabel = daysListedLabel(listing.createdAt, listing.status);
        const sku = listing.variant.gtin || product.styleId || null;
        const listedDate = new Date(listing.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const isEditable = listing.status === "active" || listing.status === "approved_awaiting_dropoff";

        return createPortal(
          <div className="fixed inset-0 z-[200] md:hidden" onClick={() => setMobileDetail(null)}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />

            {/* Drawer */}
            <div
              className="absolute inset-0 overflow-y-auto animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="min-h-full px-4 pt-3 pb-28">
                {/* Back button */}
                <button
                  onClick={() => setMobileDetail(null)}
                  className="flex items-center gap-1.5 py-3 text-sm text-muted-foreground cursor-pointer mb-3"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>

                {/* Main card */}
                <div className="glass-panel rounded-2xl overflow-hidden">
                  {/* Product image */}
                  <div className="p-5 pb-0">
                    {product.imageUrl ? (
                      <div className="w-full aspect-[4/3] rounded-xl bg-white/[0.04] flex items-center justify-center overflow-hidden">
                        <img
                          src={product.imageUrl}
                          alt={product.title}
                          className="max-h-full max-w-full object-contain p-3"
                        />
                      </div>
                    ) : (
                      <div className="w-full aspect-[4/3] rounded-xl bg-white/[0.04] flex items-center justify-center">
                        <Package className="w-14 h-14 text-muted-foreground/20" />
                      </div>
                    )}
                  </div>

                  {/* Title + status */}
                  <div className="px-5 pt-4 pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-foreground leading-tight">{product.title}</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">Size {listing.variant.size}</p>
                      </div>
                      <StatusBadge status={listing.status} />
                    </div>
                  </div>

                  {/* Price + lowest */}
                  <div className="px-5 pb-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-bold tabular-nums text-foreground">${fmt(listing.price)}</span>
                      {lowest != null && (
                        <button className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                          Lowest Ask <span className="text-foreground font-medium">${fmt(lowest)}</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Details rows */}
                  <div className="border-t border-white/[0.06]">
                    <div className="flex justify-between items-center px-5 py-3.5 border-b border-white/[0.04]">
                      <span className="text-sm text-muted-foreground">Days Listed</span>
                      <span className="text-sm font-semibold text-foreground tabular-nums">{daysLabel}</span>
                    </div>
                    {sku && (
                      <div className="flex justify-between items-center px-5 py-3.5">
                        <span className="text-sm text-muted-foreground">SKU / GTIN</span>
                        <span className="text-sm font-semibold text-foreground font-mono tabular-nums">{sku}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="p-5 pt-4 space-y-2.5 border-t border-white/[0.06]">
                    {isEditable && (
                      <div className="flex items-center justify-center gap-2.5 w-full py-2 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm font-semibold text-foreground">
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                        <InlinePrice listingId={listing.id} price={listing.price} editable />
                      </div>
                    )}
                    <Link
                      to={`/portal/listings/new?productId=${product.id}`}
                      className="flex items-center justify-center gap-2.5 w-full py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm font-semibold text-foreground hover:bg-white/[0.1] transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Quantity
                    </Link>
                    {listing.status === "active" && (
                      <button
                        onClick={() => { setMobileDetail(null); setConfirmWithdraw(listing.id); }}
                        className="flex items-center justify-center gap-2.5 w-full py-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-sm font-semibold text-orange-400 hover:bg-orange-500/20 transition-colors cursor-pointer"
                      >
                        <PackageX className="w-4 h-4" />
                        Request Withdrawal
                      </button>
                    )}
                    {listing.status === "submitted" && (
                      <>
                        <Link
                          to={`/portal/listings/${listing.id}/edit`}
                          className="flex items-center justify-center gap-2.5 w-full py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm font-semibold text-foreground hover:bg-white/[0.1] transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                          Edit Listing
                        </Link>
                        <button
                          onClick={() => { setMobileDetail(null); setConfirmDelete(listing.id); }}
                          className="flex items-center justify-center gap-2.5 w-full py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete Listing
                        </button>
                      </>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>,
          document.body,
        );
      })()}
    </div>
  );
}
