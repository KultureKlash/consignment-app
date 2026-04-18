import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "~/db.server";
import { SectionsPage } from "~/components/admin/sections/SectionsPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const sections = await prisma.storeSection.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });
  return { sections };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "create") {
      const name = (formData.get("name") as string ?? "").trim();
      if (!name) throw new Error("Name is required");
      const maxOrder = await prisma.storeSection.aggregate({ _max: { sortOrder: true } });
      await prisma.storeSection.create({
        data: { name, sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 },
      });
      return { success: true, intent };
    }
    if (intent === "rename") {
      const id = formData.get("id") as string;
      const name = (formData.get("name") as string ?? "").trim();
      if (!name) throw new Error("Name is required");
      await prisma.storeSection.update({ where: { id }, data: { name } });
      return { success: true, intent };
    }
    if (intent === "delete") {
      const id = formData.get("id") as string;
      const count = await prisma.product.count({ where: { sectionId: id } });
      if (count > 0) throw new Error(`Cannot delete — ${count} product${count !== 1 ? "s" : ""} assigned to this section`);
      await prisma.storeSection.delete({ where: { id } });
      return { success: true, intent };
    }
    throw new Error("Invalid intent");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error", intent };
  }
};

export default function Sections() {
  const { sections } = useLoaderData<typeof loader>();
  return <SectionsPage sections={sections} />;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
