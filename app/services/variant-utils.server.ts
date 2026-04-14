import prisma from "~/db.server";
import { generateBarcode, parseCategory } from "~/lib/categories";

/** Auto-generate a unique barcode for a variant that doesn't have one.
 *  Tries up to 3 candidates, throws if all collide (extremely unlikely). */
export async function ensureVariantBarcode(
  variantId: string,
  opts: { brand?: string | null; category?: string | null; size: string },
): Promise<void> {
  const sub = opts.category ? parseCategory(opts.category).sub : undefined;
  let barcode: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = generateBarcode(opts.brand ?? undefined, sub, opts.size);
    const existing = await prisma.variant.findUnique({ where: { gtin: candidate } });
    if (!existing) { barcode = candidate; break; }
  }
  if (!barcode) throw new Error("Failed to generate unique barcode after 3 attempts");
  await prisma.variant.update({ where: { id: variantId }, data: { gtin: barcode } });
}
