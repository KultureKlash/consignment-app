import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return {};
};

export default function Payouts() {
  return (
    <s-page heading="Payouts">
      <s-section>
        <div style={{ padding: "40px 0", textAlign: "center", color: "#6d7175", fontSize: "14px" }}>
          Payout management coming soon.
        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
