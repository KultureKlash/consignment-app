import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteLoaderData, useFetcher, useNavigate } from "react-router";
import { redirect } from "react-router";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "~/components/portal/AppHeader";
import { authenticatePortal } from "~/services/portal/auth.server";
import { updateSubmittedListing } from "~/services/submission.server";
import prisma from "~/db.server";
import type { loader as portalLoader } from "./portal";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");

  const listing = await prisma.listing.findFirst({
    where: { id: params.id!, consignorId: consignor.id },
    include: { variant: { include: { product: true } } },
  });

  if (!listing) throw redirect("/portal/listings");
  if (listing.status !== "submitted") throw redirect("/portal/listings");

  return { consignor, listing };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { portalFormRateLimit } = await import("~/lib/rate-limit.server");
  const limited = portalFormRateLimit(request);
  if (limited) return { error: "Too many requests. Please slow down." };

  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");
  const form = await request.formData();

  const { portalEditListingSchema, parseForm } = await import("~/lib/validation");

  try {
    const data = parseForm(portalEditListingSchema, form);
    await updateSubmittedListing({
      listingId: params.id!,
      consignorId: consignor.id,
      size: data.size,
      gtin: data.gtin,
      price: data.price,
    });
    return redirect("/portal/listings?status=submitted");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update listing" };
  }
}

export default function PortalListingEdit() {
  const { consignor, listing } = useLoaderData<typeof loader>();
  const parentData = useRouteLoaderData<typeof portalLoader>("routes/portal");
  const fetcher = useFetcher();
  const navigate = useNavigate();

  const [size, setSize] = useState(listing.variant.size);
  const [gtin, setGtin] = useState(listing.variant.gtin ?? "");
  const [price, setPrice] = useState(String(listing.price));

  const actionData = fetcher.data as { error?: string } | undefined;

  return (
    <div>
      <AppHeader title="Edit Listing" subtitle="Update your submitted listing" consignorName={consignor.name} avatarColor={parentData?.consignor?.avatarColor} notifications={parentData?.notifications} />

      <div className="px-4 md:px-8 pb-8 max-w-2xl">
        <button
          onClick={() => navigate("/portal/listings")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Listings
        </button>

        {actionData?.error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {actionData.error}
          </div>
        )}

        <fetcher.Form method="post" className="space-y-6">
          {/* Product info (read-only) */}
          <div className="glass-panel rounded-2xl p-4 md:p-6 space-y-3">
            <h3 className="text-sm font-semibold">Product</h3>
            <div className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-[rgba(255,255,255,0.08)]">
              <div className="text-sm font-medium">{listing.variant.product.title}</div>
              <div className="text-xs text-muted-foreground">
                {listing.variant.product.brand && <span>{listing.variant.product.brand} · </span>}
                {listing.variant.product.category && <span>{listing.variant.product.category}</span>}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Size</label>
              <input
                type="text"
                name="size"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">GTIN / Barcode</label>
              <input
                type="text"
                name="gtin"
                value={gtin}
                onChange={(e) => setGtin(e.target.value)}
                className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
              />
            </div>
          </div>

          {/* Price */}
          <div className="glass-panel rounded-2xl p-4 md:p-6 space-y-3">
            <h3 className="text-sm font-semibold">Pricing</h3>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Ask Price ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  name="price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="glass-input w-full pl-7 pr-3 py-2.5 rounded-xl text-sm"
                  step="0.01"
                  min="0.01"
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={fetcher.state !== "idle"}
            className="btn-cta w-full py-3 text-sm text-center"
          >
            {fetcher.state !== "idle" ? "Saving..." : "Save Changes"}
          </button>
        </fetcher.Form>
      </div>
    </div>
  );
}
