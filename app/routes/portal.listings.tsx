import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useRouteLoaderData, useFetcher, Link, useSearchParams } from "react-router";
import { redirect } from "react-router";
import { Plus, Package, Search, Eye, EyeOff, ChevronLeft, ChevronRight, DollarSign } from "lucide-react";
import { AppHeader } from "~/components/portal/AppHeader";
import { authenticatePortal } from "~/services/portal/auth.server";
import { deleteSubmittedListing, updateActiveListingPrice, requestWithdrawal, setUnpricedListingPrice, bulkSetUnpricedListingPrices } from "~/services/submission";
import prisma from "~/db.server";
import type { loader as portalLoader } from "./portal";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import {
  ACTIVE_STATUSES, groupByProduct, ListingGroup, MobileDetailDrawer,
  ConfirmModal, useInfiniteScroll, StatusTabs,
} from "~/components/portal/listings";
import type { ListingRow } from "~/components/portal/listings";

export async function loader({ request }: LoaderFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") ?? "all";
  const showInactive = url.searchParams.get("inactive") === "1";
  const search = url.searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const PAGE_SIZE = 25;
  const where: Record<string, unknown> = { consignorId: consignor.id };
  if (statusFilter === "withdrawals") where.status = { in: [LISTING_STATUS.WITHDRAWAL_REQUESTED, LISTING_STATUS.PENDING_PICKUP, LISTING_STATUS.WITHDRAWN] };
  else if (statusFilter !== "all") where.status = statusFilter;
  else if (!showInactive) where.status = { in: ACTIVE_STATUSES };
  if (search) {
    where.AND = [{
      OR: [
        { variant: { product: { title: { contains: search, mode: "insensitive" } } } },
        { variant: { product: { brand: { contains: search, mode: "insensitive" } } } },
        { variant: { product: { sku: { contains: search, mode: "insensitive" } } } },
        { variant: { size: { contains: search, mode: "insensitive" } } },
      ],
    }];
  }
  const allListings = await prisma.listing.findMany({
    where, include: { variant: { include: { product: true } } }, orderBy: { createdAt: "desc" },
  });
  // Paginate by product groups
  const groupMap = new Map<string, typeof allListings>();
  for (const l of allListings) { const pid = l.variant.product.id; const list = groupMap.get(pid) || []; list.push(l); groupMap.set(pid, list); }
  const totalGroups = groupMap.size;
  const totalPages = Math.max(1, Math.ceil(totalGroups / PAGE_SIZE));
  const pageKeys = [...groupMap.keys()].slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const listings = pageKeys.flatMap((k) => groupMap.get(k) || []);
  // Status counts for tabs
  const counts = await prisma.listing.groupBy({ by: ["status"], where: { consignorId: consignor.id }, _count: true });
  const statusCounts: Record<string, number> = {};
  for (const c of counts) statusCounts[c.status] = c._count;
  // Lowest active price per variant
  const variantIds = [...new Set(listings.map((l) => l.variantId))];
  const lowestPrices: Record<string, number> = {};
  if (variantIds.length > 0) {
    const mins = await prisma.listing.groupBy({ by: ["variantId"], where: { variantId: { in: variantIds }, status: LISTING_STATUS.ACTIVE }, _min: { price: true } });
    for (const m of mins) if (m._min.price != null) lowestPrices[m.variantId] = m._min.price;
  }
  return { consignor, listings, statusCounts, statusFilter, showInactive, search, lowestPrices, page, totalPages, totalGroups };
}

export async function action({ request }: ActionFunctionArgs) {
  const { portalFormRateLimit } = await import("~/lib/rate-limit.server");
  const limited = portalFormRateLimit(request);
  if (limited) return limited;
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");
  const fd = await request.formData();
  const intent = fd.get("intent") as string;
  const listingId = fd.get("listingId") as string;
  if (intent === "delete") { await deleteSubmittedListing({ listingId, consignorId: consignor.id }); return { ok: true }; }
  if (intent === "update-price") {
    const raw = parseFloat(fd.get("price") as string);
    if (!listingId || isNaN(raw) || raw <= 0 || raw > 999999.99) return { error: "Invalid price" };
    const price = Math.round(raw * 100) / 100;
    await updateActiveListingPrice({ listingId, consignorId: consignor.id, price }); return { ok: true };
  }
  if (intent === "request-withdrawal") {
    if (!listingId) return { error: "Missing listing ID" };
    await requestWithdrawal({ listingId, consignorId: consignor.id }); return { ok: true };
  }
  if (intent === "set-initial-price") {
    const raw = parseFloat(fd.get("price") as string);
    if (!listingId || isNaN(raw) || raw <= 0 || raw > 999999.99) return { error: "Invalid price" };
    const price = Math.round(raw * 100) / 100;
    try {
      await setUnpricedListingPrice({ listingId, consignorId: consignor.id, price });
      return { ok: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to set price" };
    }
  }
  if (intent === "bulk-set-initial-price") {
    const raw = parseFloat(fd.get("price") as string);
    const listingIds = (fd.getAll("listingIds") as string[]).filter(Boolean);
    if (!listingIds.length || isNaN(raw) || raw <= 0 || raw > 999999.99) return { error: "Invalid input" };
    const price = Math.round(raw * 100) / 100;
    try {
      const result = await bulkSetUnpricedListingPrices({ listingIds, consignorId: consignor.id, price });
      return { ok: true, ...result };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to set prices" };
    }
  }
  return { error: "Invalid intent" };
}

export default function PortalListings() {
  const { consignor, listings, statusCounts, statusFilter, showInactive, search: initialSearch, lowestPrices, page, totalPages } = useLoaderData<typeof loader>();
  const parentData = useRouteLoaderData<typeof portalLoader>("routes/portal");
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState(initialSearch);
  const serverGroups = groupByProduct(listings as unknown as ListingRow[]);
  const { mobileGroups, mobileLoading, scrollSentinel } = useInfiniteScroll(serverGroups, page, totalPages, statusFilter, showInactive, initialSearch, searchParams);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [mobileDetail, setMobileDetail] = useState<string | null>(null);

  const toggleGroup = (productId: string) => {
    setExpandedGroups((prev) => { const next = new Set(prev); if (next.has(productId)) next.delete(productId); else next.add(productId); return next; });
  };

  useEffect(() => { setSearchValue(initialSearch); }, [initialSearch]);
  useEffect(() => {
    if (searchValue === initialSearch) return;
    const timer = setTimeout(() => {
      setSearchParams((prev) => { const next = new URLSearchParams(prev); if (searchValue) next.set("search", searchValue); else next.delete("search"); return next; });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchValue]);

  const handleDelete = (id: string) => { fetcher.submit({ intent: "delete", listingId: id }, { method: "POST" }); setConfirmDelete(null); };
  const handleWithdraw = (id: string) => { fetcher.submit({ intent: "request-withdrawal", listingId: id }, { method: "POST" }); setConfirmWithdraw(null); };

  const buildTabUrl = (tabKey: string) => {
    const params = new URLSearchParams();
    if (tabKey !== "all") params.set("status", tabKey);
    if (showInactive) params.set("inactive", "1");
    if (searchValue) params.set("search", searchValue);
    const qs = params.toString();
    return `/portal/listings${qs ? `?${qs}` : ""}`;
  };

  const toggleInactive = () => {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); if (showInactive) next.delete("inactive"); else next.set("inactive", "1"); return next; });
  };

  const mobileDetailListing = mobileDetail ? (listings as unknown as ListingRow[]).find((l) => l.id === mobileDetail) : null;

  return (
    <div>
      <AppHeader title="My Listings" subtitle="Track and manage your consignment items" consignorName={consignor.name} avatarColor={parentData?.consignor?.avatarColor} notifications={parentData?.notifications} />
      <div className="px-4 md:px-8 pb-8 space-y-4 md:space-y-6">
        <div className="flex items-center justify-between animate-slide-up"><div /><Link to="/portal/listings/new" className="btn-cta inline-flex items-center gap-2 px-4 py-2.5 text-sm"><Plus className="w-4 h-4" />Submit New Listing</Link></div>

        {(statusCounts[LISTING_STATUS.AWAITING_PRICE] ?? 0) > 0 && statusFilter !== LISTING_STATUS.AWAITING_PRICE && (
          <Link
            to={buildTabUrl(LISTING_STATUS.AWAITING_PRICE)}
            className="glass-panel rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-amber-400/[0.04] border border-amber-400/20 cursor-pointer transition-colors animate-slide-up no-underline"
          >
            <span className="w-8 h-8 rounded-full bg-amber-400/15 flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4 text-amber-300" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                You have {statusCounts[LISTING_STATUS.AWAITING_PRICE]} item{statusCounts[LISTING_STATUS.AWAITING_PRICE] !== 1 ? "s" : ""} waiting on a price
              </p>
              <p className="text-xs text-muted-foreground">Set prices to make them live on the store</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </Link>
        )}

        <StatusTabs statusFilter={statusFilter} statusCounts={statusCounts} showInactive={showInactive} buildTabUrl={buildTabUrl} />

        <button onClick={toggleInactive} className="flex items-center gap-2.5 cursor-pointer animate-slide-up" style={{ animationDelay: "120ms" }}>
          <div className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 ${showInactive ? "bg-white/25" : "bg-white/10"}`}>
            <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full shadow-sm transition-transform duration-200 ${showInactive ? "translate-x-[18px] bg-white" : "translate-x-0 bg-white/50"}`} />
          </div>
          {showInactive ? <Eye className="w-3.5 h-3.5 text-muted-foreground" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground">Show inactive products</span>
        </button>

        <div className="relative animate-slide-up" style={{ animationDelay: "160ms" }}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input type="text" value={searchValue} onChange={(e) => setSearchValue(e.target.value)} placeholder="Search by product name, size, or SKU" className="glass-input w-full pl-10 pr-3 py-2.5 rounded-xl text-sm" />
        </div>

        {listings.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center animate-slide-up" style={{ animationDelay: "160ms" }}>
            <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">No listings found.</p>
            <p className="text-xs text-muted-foreground mt-1">Submit a new listing to get started.</p>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: "160ms" }}>
            <div className="hidden md:block">
              {serverGroups.map((group) => (
                <ListingGroup key={group.productId} group={group} isOpen={expandedGroups.has(group.productId)} onToggle={() => toggleGroup(group.productId)} lowestPrices={lowestPrices} onConfirmDelete={setConfirmDelete} onConfirmWithdraw={setConfirmWithdraw} />
              ))}
            </div>
            <div className="md:hidden divide-y divide-[rgba(255,255,255,0.06)]">
              {mobileGroups.map((group) => (
                <ListingGroup key={group.productId} group={group} isOpen={expandedGroups.has(group.productId)} onToggle={() => toggleGroup(group.productId)} lowestPrices={lowestPrices} onConfirmDelete={setConfirmDelete} onConfirmWithdraw={setConfirmWithdraw} onMobileDetail={setMobileDetail} mobile />
              ))}
            </div>
          </div>
        )}

        <div ref={scrollSentinel} className="md:hidden h-4">
          {mobileLoading && <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}
        </div>

        {totalPages > 1 && (
          <div className="hidden md:flex items-center justify-center pt-5">
            <div className="inline-flex items-center glass-panel rounded-full px-1.5 py-1.5 gap-1">
              <button onClick={() => setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set("page", String(page - 1)); return p; })} disabled={page <= 1} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/[0.08] transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-default"><ChevronLeft className="w-4 h-4" /></button>
              <div className="px-3 text-xs tabular-nums"><span className="text-foreground font-semibold">{page}</span><span className="text-muted-foreground/50 mx-1.5">/</span><span className="text-muted-foreground">{totalPages}</span></div>
              <button onClick={() => setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set("page", String(page + 1)); return p; })} disabled={page >= totalPages} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/[0.08] transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-default"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {confirmDelete && <ConfirmModal title="Delete Listing?" message="This will permanently remove this submitted listing. This cannot be undone." confirmLabel="Delete" confirmClassName="bg-red-500/15 text-red-400 hover:bg-red-500/25" onConfirm={() => handleDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}
      {confirmWithdraw && <ConfirmModal title="Withdraw Listing?" message="This will remove the item from the store immediately. An admin will process your withdrawal request." confirmLabel="Withdraw" confirmClassName="bg-orange-500/15 text-orange-400 hover:bg-orange-500/25" onConfirm={() => handleWithdraw(confirmWithdraw)} onCancel={() => setConfirmWithdraw(null)} />}
      {mobileDetailListing && <MobileDetailDrawer listing={mobileDetailListing} lowestPrices={lowestPrices} onClose={() => setMobileDetail(null)} onConfirmDelete={setConfirmDelete} onConfirmWithdraw={setConfirmWithdraw} />}
    </div>
  );
}
