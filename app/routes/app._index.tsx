import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { createListing } from "~/services/listings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const listing = await createListing({
    admin,
    styleId: "DD1391-100",
    title: "Nike Dunk Panda",
    brand: "Nike",
    size: "9",
    price: 350,
    quantity: 2,
    consignorId: "cmmlq8sfu0000cu6g84sy6kb6",
  });

  return { listing };
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();

  const shopify = useAppBridge();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.listing?.id) {
      shopify.toast.show("Listing created");
    }
  }, [fetcher.data?.listing?.id, shopify]);

  const createTestListing = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="Shopify Consignment App">
      <s-button slot="primary-action" onClick={createTestListing}>
        Create test listing
      </s-button>

      <s-section heading="Test listing creation">
        <s-paragraph>
          Click the button to create a test listing and sync the product to Shopify.
        </s-paragraph>

        <s-stack direction="inline" gap="base">
          <s-button
            onClick={createTestListing}
            {...(isLoading ? { loading: true } : {})}
          >
            Create test listing
          </s-button>
        </s-stack>

        {fetcher.data?.listing && (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <pre style={{ margin: 0 }}>
              <code>
                {JSON.stringify(fetcher.data.listing, null, 2)}
              </code>
            </pre>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
