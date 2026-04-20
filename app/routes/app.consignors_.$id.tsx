import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { LISTING_STATUS } from "~/lib/listing-statuses";
import { logger } from "~/lib/logger.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getConsignorDetail, updateConsignor, suspendConsignor, unsuspendConsignor, getConsignorVariantIds } from "~/services/consignors";
import { syncInventory } from "~/services/inventory";
import prisma from "~/db.server";
import { ConsignorDetailPage } from "~/components/admin/consignors/ConsignorDetailPage";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const id = params.id!;
  return getConsignorDetail(id);
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const id = params.id!;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "update") {
      const { updateConsignorSchema, parseForm } = await import("~/lib/validation");
      const data = parseForm(updateConsignorSchema, formData);

      await updateConsignor(id, {
        name: data.name,
        email: data.email,
        feeRate: data.feeRate,
        storeOwned: data.storeOwned ?? false,
        taxStatus: data.taxStatus,
        gstNumber: data.gstNumber,
        qstNumber: data.qstNumber,
        province: data.province,
      });
      return { success: true, intent };
    }
    if (intent === "suspend") {
      const { admin } = await authenticate.admin(request);
      const reason = (formData.get("reason") as string ?? "").trim();
      const pauseListings = formData.get("pauseListings") === "true";

      // Get affected variant IDs before pausing (for Shopify sync)
      const variantIds = pauseListings ? await getConsignorVariantIds(id, "active") : [];

      const { pausedCount } = await suspendConsignor(id, reason || undefined, { pauseListings });

      // Sync affected variants to Shopify (inventory drops to 0)
      for (const variantId of variantIds) {
        try {
          const variant = await prisma.variant.findUniqueOrThrow({ where: { id: variantId } });
          await syncInventory({ admin, variant });
        } catch (err) {
          logger.error("Shopify sync failed for variant", { variantId, error: err instanceof Error ? err.message : String(err) });
        }
      }

      return { success: true, intent, pausedCount };
    }
    if (intent === "unsuspend") {
      const { admin } = await authenticate.admin(request);

      // Get variant IDs of paused listings before reactivating (for Shopify sync)
      const variantIds = await getConsignorVariantIds(id, LISTING_STATUS.PAUSED);

      const { reactivatedCount } = await unsuspendConsignor(id);

      // Re-sync variants to Shopify (inventory goes back up)
      for (const variantId of variantIds) {
        try {
          const variant = await prisma.variant.findUniqueOrThrow({ where: { id: variantId } });
          await syncInventory({ admin, variant });
        } catch (err) {
          logger.error("Shopify sync failed for variant", { variantId, error: err instanceof Error ? err.message : String(err) });
        }
      }

      return { success: true, intent, reactivatedCount };
    }
    throw new Error("Invalid intent");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message, intent };
  }
};

export default function ConsignorDetail() {
  const loaderData = useLoaderData<typeof loader>();
  return <ConsignorDetailPage loaderData={loaderData} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
