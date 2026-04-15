import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { createListing, deleteListing } from "~/services/listings.server";
import { adminEditListing } from "~/services/submission.server";
import prisma from "~/db.server";
import CreateListingForm from "~/components/admin/create-listing";
import ListingsTable from "~/components/admin/listings";
import type { EditApproveFields } from "~/components/admin/listings";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const [consignors, allRecent, brandRows] = await Promise.all([
    prisma.consignor.findMany({ orderBy: { name: "asc" } }),
    prisma.listing.findMany({
      take: 200,
      orderBy: { createdAt: "desc" },
      include: {
        consignor: true,
        variant: { include: { product: true } },
      },
    }),
    prisma.product.groupBy({ by: ["brand"], where: { brand: { not: null } } }),
  ]);

  // Group by product, take first 10 groups, flatten back
  const grouped = new Map<string, typeof allRecent>();
  for (const l of allRecent) {
    const pid = l.variant.product.id;
    if (!grouped.has(pid)) grouped.set(pid, []);
    grouped.get(pid)!.push(l);
  }
  const listings = Array.from(grouped.values()).slice(0, 10).flat();

  const knownBrands = brandRows.map((r) => r.brand).filter((b): b is string => b !== null);

  return { consignors, listings, knownBrands };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    switch (intent) {
      case "create": {
        const sku = (formData.get("sku") as string ?? "").trim().toUpperCase() || undefined;
        const title = (formData.get("title") as string ?? "").trim();
        const brand = (formData.get("brand") as string ?? "").trim() || undefined;
        const category = (formData.get("category") as string ?? "").trim() || undefined;
        const size = (formData.get("size") as string ?? "").trim();
        const gtin = (formData.get("gtin") as string ?? "").trim() || undefined;
        const priceRaw = formData.get("price") as string;
        const quantityRaw = formData.get("quantity") as string;
        const consignorId = formData.get("consignorId") as string;
        const taxonomyId = (formData.get("shopifyCategoryId") as string ?? "").trim() || undefined;

        const catIsFootwear = !category || category.startsWith("Footwear");

        if (!consignorId || !title || !size) {
          return { error: "Consignor, Title, and Size are required", intent };
        }
        if (catIsFootwear && !gtin) {
          return { error: "GTIN (barcode) is required for footwear", intent };
        }

        const price = Number(priceRaw);
        if (isNaN(price) || price <= 0) {
          return { error: "Price must be greater than 0", intent };
        }

        const quantity = parseInt(quantityRaw, 10) || 1;
        if (quantity < 1 || quantity > 50) {
          return { error: "Quantity must be between 1 and 50", intent };
        }

        const consignor = await prisma.consignor.findUnique({ where: { id: consignorId } });
        if (!consignor) {
          return { error: "Consignor not found", intent };
        }

        const imageData = (formData.get("image") as string ?? "").trim() || undefined;

        const costRaw = (formData.get("cost") as string ?? "").trim();
        const cost = costRaw ? Number(costRaw) : undefined;

        const listing = await createListing({
          admin, sku, title, brand, category, size, gtin, price, count: quantity, consignorId, taxonomyId, imageData, cost,
        });

        return { listing, intent, quantity };
      }

      case "cancel": {
        const listing = await deleteListing({
          admin,
          listingId: formData.get("listingId") as string,
        });
        return { listing, intent };
      }

      case "admin-edit": {
        await adminEditListing({
          admin,
          listingId: formData.get("listingId") as string,
          title: (formData.get("title") as string) || undefined,
          brand: (formData.get("brand") as string) || undefined,
          category: (formData.get("category") as string) || undefined,
          sku: (formData.get("sku") as string) || undefined,
          size: (formData.get("size") as string) || undefined,
          gtin: (formData.get("gtin") as string) || undefined,
          price: formData.get("price") ? Number(formData.get("price")) : undefined,
          cost: formData.has("cost") ? (formData.get("cost") ? Number(formData.get("cost")) : null) : undefined,
        });
        return { intent };
      }

      default:
        throw new Error("Invalid intent");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message, intent };
  }
};

export default function Inventory() {
  const { consignors, listings, knownBrands } = useLoaderData<typeof loader>();
  const cancelFetcher = useFetcher();
  const editFetcher = useFetcher();
  const shopify = useAppBridge();

  const cancelLoading = ["loading", "submitting"].includes(cancelFetcher.state);
  const editLoading = ["loading", "submitting"].includes(editFetcher.state);

  useEffect(() => {
    const data = cancelFetcher.data as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.error) {
      shopify.toast.show(data.error as string);
    } else if (data.intent === "cancel") {
      shopify.toast.show("Listing cancelled");
    }
  }, [cancelFetcher.data, shopify]);

  useEffect(() => {
    const data = editFetcher.data as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.error) {
      shopify.toast.show(data.error as string);
    } else if (data.intent === "admin-edit") {
      shopify.toast.show("Listing updated");
    }
  }, [editFetcher.data, shopify]);

  const handleCancel = (listingId: string) => {
    cancelFetcher.submit({ intent: "cancel", listingId }, { method: "POST" });
  };

  const handleAdminEdit = (listingId: string, fields: EditApproveFields) => {
    const submitData: Record<string, string> = { intent: "admin-edit", listingId, ...fields };
    if (!fields.cost) delete submitData.cost;
    editFetcher.submit(submitData, { method: "POST" });
  };

  return (
    <s-page heading="Create Listing">
      <CreateListingForm consignors={consignors} knownBrands={knownBrands} />

      <s-section heading="Recent Listings">
        <ListingsTable listings={listings} grouped onCancel={handleCancel} onAdminEdit={handleAdminEdit} isLoading={cancelLoading || editLoading} />
        {listings.length > 0 && (
          <div style={{ textAlign: "center", marginTop: "12px" }}>
            <Link
              to="/app/listings"
              style={{ color: "#4f46e5", fontWeight: 500, fontSize: "13px", textDecoration: "none" }}
            >
              View all listings →
            </Link>
          </div>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
