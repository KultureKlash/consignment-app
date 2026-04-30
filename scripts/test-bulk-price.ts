import "dotenv/config";
import { bulkSetUnpricedListingPrices } from "../app/services/submission/consignor-actions.server";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  // Target Yaroslav's AJ4 unpriced listings (2 same product/size — the bulk case)
  const listings = await p.listing.findMany({
    where: {
      status: "awaiting_price",
      consignor: { name: "Yaroslav Bilodid" },
      variant: { product: { sku: "AJ4-WC-GS-2025" } },
    },
    include: { consignor: true },
  });
  if (listings.length === 0) {
    console.log("No unpriced listings — please re-run scripts/seed-unpriced.ts first");
    return;
  }
  console.log("Will bulk-price:", listings.length, "listings for", listings[0]?.consignor.name);
  console.log("IDs:", listings.map((l) => l.id));

  try {
    const result = await bulkSetUnpricedListingPrices({
      listingIds: listings.map((l) => l.id),
      consignorId: listings[0].consignorId,
      price: 250,
    });
    console.log("SUCCESS:", result);
  } catch (err) {
    console.log("ERROR:", err);
    if (err instanceof Error) console.log("Stack:", err.stack);
  }
  await p.$disconnect();
}

main();
