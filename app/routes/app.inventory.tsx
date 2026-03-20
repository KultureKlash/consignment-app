import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { createListing, cancelListing } from "~/services/listings.server";
import prisma from "~/db.server";
import CreateListingForm from "~/components/CreateListingForm";
import ListingsTable from "~/components/ListingsTable";

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
        const styleId = (formData.get("styleId") as string ?? "").trim().toUpperCase() || undefined;
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

        const listing = await createListing({
          admin, styleId, title, brand, category, size, gtin, price, count: quantity, consignorId, taxonomyId, imageData,
        });

        return { listing, intent, quantity };
      }

      case "cancel": {
        const listing = await cancelListing({
          admin,
          listingId: formData.get("listingId") as string,
        });
        return { listing, intent };
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
  const shopify = useAppBridge();

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

  const handleCancel = (listingId: string) => {
    cancelFetcher.submit({ intent: "cancel", listingId }, { method: "POST" });
  };

  return (
    <s-page heading="Create Listing">
      <CreateListingForm consignors={consignors} knownBrands={knownBrands} />

      <s-section heading="Recent Listings">
        <ListingsTable listings={listings} grouped onCancel={handleCancel} isLoading={cancelLoading} />
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
