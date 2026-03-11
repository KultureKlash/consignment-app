import prisma from "~/db.server";

export async function findProductByStyleId(styleId: string) {
  return prisma.product.findUnique({
    where: { styleId },
  });
}

export async function createProduct({
  styleId,
  title,
  brand,
}: {
  styleId: string;
  title: string;
  brand?: string;
}) {
  return prisma.product.create({
    data: { styleId, title, brand },
  });
}

export async function findOrCreateProduct({
  styleId,
  title,
  brand,
}: {
  styleId: string;
  title: string;
  brand?: string;
}) {
  const existing = await findProductByStyleId(styleId);
  if (existing) return existing;
  return createProduct({ styleId, title, brand });
}

export async function findOrCreateVariant({
  productId,
  size,
}: {
  productId: string;
  size: string;
}) {
  const existing = await prisma.variant.findFirst({
    where: { productId, size },
  });
  if (existing) return existing;
  return prisma.variant.create({
    data: { productId, size },
  });
}
