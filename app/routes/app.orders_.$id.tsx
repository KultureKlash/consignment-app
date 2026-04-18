import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getOrderDetail } from "~/services/order-queries.server";
import { OrderDetailPage } from "~/components/admin/orders/OrderDetailPage";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const id = params.id!;
  return getOrderDetail(id);
};

export default function OrderDetail() {
  const data = useLoaderData<typeof loader>();
  return <OrderDetailPage {...data} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
