import { json } from "@remix-run/node";
import prisma from "~/db.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function action({ request }: any) {
  const body = await request.json();

  const { title, brand, styleId, sizes } = body;

  const product = await prisma.product.create({
    data: {
      title,
      brand,
      styleId,
      variants: {
        create: sizes.map((size: string) => ({
          size
        }))
      }
    },
    include: {
      variants: true
    }
  });

  return json(product);
}