import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "~/db.server";
import type { Prisma } from "@prisma/client";
import { ORDER_STATUS, ORDER_PAYMENT_STATUS } from "~/lib/order-statuses";
import OrdersListPage from "~/components/admin/orders/OrdersListPage";

function buildStatusWhere(status: string): Prisma.OrderWhereInput {
  switch (status) {
    case "paid":
      return { paymentStatus: ORDER_PAYMENT_STATUS.PAID, status: { notIn: [ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED] } };
    case "pending":
      return { paymentStatus: ORDER_PAYMENT_STATUS.PENDING, status: { notIn: [ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED] } };
    case "cancelled":
      return { status: ORDER_STATUS.CANCELLED };
    case "refunded":
      return { status: ORDER_STATUS.REFUNDED };
    case "voided":
      return { paymentStatus: "voided" };
    default:
      return {};
  }
}

function buildDateWhere(dateRange: string, from?: string, to?: string): Prisma.OrderWhereInput {
  const now = new Date();
  switch (dateRange) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { createdAt: { gte: start } };
    }
    case "7d": {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return { createdAt: { gte: start } };
    }
    case "30d": {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return { createdAt: { gte: start } };
    }
    case "custom": {
      if (from && to) {
        const startDate = new Date(from);
        const endDate = new Date(to);
        endDate.setDate(endDate.getDate() + 1); // include the end day
        return { createdAt: { gte: startDate, lt: endDate } };
      }
      return {};
    }
    default:
      return {};
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const status = url.searchParams.get("status") ?? "all";
  const dateRange = url.searchParams.get("dateRange") ?? "all";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  const where: Prisma.OrderWhereInput = {
    ...buildStatusWhere(status),
    ...buildDateWhere(dateRange, from || undefined, to || undefined),
  };

  if (search) {
    where.OR = [
      { orderNumber: { contains: search } },
      { items: { some: { listing: { variant: { product: { title: { contains: search } } } } } } },
    ];
  }

  const orders = await prisma.order.findMany({
    where,
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          listing: {
            include: {
              variant: { include: { product: true } },
            },
          },
        },
      },
    },
  });

  return { orders, filters: { search, status, dateRange, from, to } };
};

export default function Orders() {
  const { orders, filters } = useLoaderData<typeof loader>();
  return <OrdersListPage orders={orders as any} filters={filters} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
