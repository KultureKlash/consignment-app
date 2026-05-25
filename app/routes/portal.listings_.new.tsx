import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { redirect } from "react-router";
import { authenticatePortal } from "~/services/portal/auth.server";
import { submitListing } from "~/services/submission";
import { DuplicateError } from "~/services/catalog";
import { isFootwear, buildCategory } from "~/lib/categories";
import { NewListingPage } from "~/components/portal/listings/new/NewListingPage";
import type { ProductResult } from "~/components/portal/listings/new/NewListingPage";

export async function loader({ request }: LoaderFunctionArgs) {
  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");

  // Pre-fill product if productId param is provided (quick-add from listings)
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  let prefillProduct: ProductResult | null = null;
  if (productId) {
    const { default: prisma } = await import("~/db.server");
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { orderBy: { size: "asc" } } },
    });
    if (product) {
      prefillProduct = {
        id: product.id,
        sku: product.sku,
        title: product.title,
        brand: product.brand,
        category: product.category,
        imageUrl: product.imageUrl,
        variants: product.variants.map((v) => ({ id: v.id, size: v.size, gtin: v.gtin })),
      };
    }
  }

  return { consignor, prefillProduct };
}

export async function action({ request }: ActionFunctionArgs) {
  const { portalFormRateLimit } = await import("~/lib/rate-limit.server");
  const limited = portalFormRateLimit(request);
  if (limited) return { error: "Too many requests. Please slow down." };

  const consignor = await authenticatePortal(request);
  if (!consignor) throw redirect("/portal/login");
  const form = await request.formData();

  const { submitListingSchema, parseForm } = await import("~/lib/validation");

  try {
    const data = parseForm(submitListingSchema, form);
    const category = data.mainCategory ? buildCategory(data.mainCategory, data.subCategory) : undefined;

    // GTIN required for footwear
    if (isFootwear(category ?? "") && !data.gtin) {
      return { error: "GTIN is required for footwear" };
    }

    // Image upload — server-side validation
    const rawImageData = (form.get("imageData") as string) || undefined;
    let imageData: string | undefined;
    if (rawImageData) {
      if (!rawImageData.startsWith("data:image/png;base64,")) return { error: "Invalid image format" };
      if (rawImageData.length > 2_000_000) return { error: "Image too large" };
      imageData = rawImageData;
    }

    const useExistingProductId = (form.get("useExistingProductId") as string | null)?.trim() || undefined;
    const forceCreate = form.get("forceCreate") === "1";

    await submitListing({
      consignorId: consignor.id,
      title: data.title,
      brand: data.brand,
      category,
      sku: data.sku,
      size: data.size,
      gtin: data.gtin,
      price: data.price,
      count: data.quantity,
      imageData,
      useExistingProductId,
      forceCreate,
    });
    return redirect("/portal/listings?status=submitted");
  } catch (err) {
    if (err instanceof DuplicateError) {
      return {
        error: "duplicate-product" as const,
        duplicate: err.match,
        // echo back so the modal can re-submit with all original fields preserved
        submitted: Object.fromEntries(form.entries()),
      };
    }
    return { error: err instanceof Error ? err.message : "Failed to submit listing" };
  }
}

export default function PortalListingNew() {
  const data = useLoaderData<typeof loader>();
  return <NewListingPage {...data} />;
}
