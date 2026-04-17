import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  // Report on what was created vs expected
  const consignors = await prisma.consignor.findMany({ select: { id: true, name: true, email: true, storeOwned: true, _count: { select: { listings: true } } }, orderBy: { name: "asc" } });
  const totalListings = await prisma.listing.count();
  const totalProducts = await prisma.product.count();
  const totalVariants = await prisma.variant.count();

  const expected = { listings: 2604, consignors: 19, mergedTo: 18 };

  const report = [
    `=== MIGRATION REPORT ===`,
    ``,
    `Expected: ~${expected.listings} listings, ${expected.mergedTo} consignors`,
    `Actual:   ${totalListings} listings, ${consignors.length} consignors, ${totalProducts} products, ${totalVariants} variants`,
    `Gap:      ${expected.listings - totalListings} listings missing`,
    ``,
    `=== CONSIGNORS ===`,
    ...consignors.map(c => `${c.storeOwned ? "[STORE] " : ""}${c.name} (${c.email}) — ${c._count.listings} listings`),
    ``,
    `=== LISTINGS BY CONSIGNOR ===`,
    `Total: ${totalListings}`,
  ];

  return new Response(report.join("\n"), { headers: { "Content-Type": "text/plain" } });
}
