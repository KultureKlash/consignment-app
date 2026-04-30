import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "~/db.server";
import { syncProductSummaryMetafield } from "~/services/shopify/product-summary-metafield.server";
import { updateShopifyProduct } from "~/services/shopify/products.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const synced = await prisma.product.count({ where: { shopifyProductId: { not: null } } });
  return { syncedCount: synced };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  const products = await prisma.product.findMany({
    where: { shopifyProductId: { not: null } },
  });

  let success = 0;
  let failed = 0;
  for (const p of products) {
    try {
      if (intent === "fix-product-types") {
        // Re-runs productUpdate which now sends a clean productType (sub-only)
        await updateShopifyProduct({ admin, product: p });
      } else {
        await syncProductSummaryMetafield({ admin, productId: p.id });
      }
      success++;
    } catch {
      failed++;
    }
  }
  return { success, failed, total: products.length, intent };
};

export default function BackfillMetafields() {
  const data = useActionData<typeof action>();
  const navigation = useNavigation();
  const isRunning = navigation.state !== "idle";

  return (
    <s-page heading="Backfill Konsign data">
      <s-section heading="Konsign Inventory metafields">
        <p style={{ marginBottom: 16 }}>
          Writes the <code>konsign.summary</code> metafield to every Shopify-synced product so the
          Konsign Inventory block on Shopify product pages can render. Run once after deploying the
          block extension. Future listing changes auto-update the metafield.
        </p>
        <Form method="post">
          <input type="hidden" name="intent" value="sync-metafields" />
          <button type="submit" disabled={isRunning} style={{ padding: "8px 16px" }}>
            {isRunning ? "Running…" : "Backfill metafields"}
          </button>
        </Form>
      </s-section>

      <s-section heading="Fix product types on Shopify">
        <p style={{ marginBottom: 16 }}>
          Re-syncs every Shopify product's <code>productType</code> from our internal category
          (legacy <code>"Footwear &gt; Sneakers"</code> becomes <code>"Sneakers"</code>). Run once
          to clean up products created before the format change.
        </p>
        <Form method="post">
          <input type="hidden" name="intent" value="fix-product-types" />
          <button type="submit" disabled={isRunning} style={{ padding: "8px 16px" }}>
            {isRunning ? "Running…" : "Fix product types"}
          </button>
        </Form>
      </s-section>

      {data && (
        <s-section>
          <p>
            <strong>{data.intent === "fix-product-types" ? "Product types" : "Metafields"}:</strong>{" "}
            {data.success}/{data.total} updated{data.failed ? `, ${data.failed} failed` : ""}.
          </p>
        </s-section>
      )}
    </s-page>
  );
}
