import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { parseCategory } from "~/lib/categories";
import { logger } from "~/lib/logger.server";

// In-memory cache: search term → taxonomy GID (survives across requests within same process)
const taxonomyCache = new Map<string, string | null>();

// Maps our subcategory names to Shopify taxonomy search terms
// All terms must resolve under "Apparel & Accessories" in Shopify's taxonomy
// Simple search terms verified against real Shopify taxonomy API.
// Each term returns the correct "Apparel & Accessories" subcategory as first result.
const TAXONOMY_SEARCH_TERMS: Record<string, string> = {
  // Footwear
  "Sneakers": "sneakers",
  "Slides": "sandals",
  "Boots": "boots",
  // Apparel — using more specific search terms to avoid hitting
  // "Baby & Toddler T-Shirts" (which is the first match for plain "t-shirts")
  "T-Shirts": "tees shirts tops",
  "Long Sleeves": "tees shirts tops",
  "Hoodies": "hoodies",
  "Sweatshirts": "sweatshirts",
  "Sweaters": "sweaters clothing",
  "Jackets": "coats jackets",
  "Puffer Jackets": "coats jackets",
  "Varsity Jackets": "coats jackets",
  "Vests": "vests",
  "Jeans": "jeans",
  "Pants": "pants",
  "Sweatpants": "pants",
  "Shorts": "shorts",
  "Jerseys": "tees shirts tops",
  "Polos": "polo shirts",
  "Tracksuits": "outerwear",
  // Accessories
  "Handbags": "handbags",
  "Saddle Bags": "handbags",
  "Messenger Bags": "handbags",
  "Backpacks": "backpacks",
  "Pouches": "handbags",
  "Wallets": "wallets",
  "Card Holders": "wallets",
  "Belts": "belts",
  "Sunglasses": "sunglasses",
  // Headwear
  "Caps": "hats",
  "Beanies": "hats",
  "Bucket Hats": "hats",
  "Fitted Hats": "hats",
  "Snapbacks": "hats",
  "Trucker Hats": "hats",
};

/**
 * Resolve our local category (e.g. "Sneakers") to a Shopify taxonomy GID.
 * Supports both new format ("Sneakers") and legacy ("Footwear > Sneakers").
 * Uses in-memory cache to avoid repeated API calls for the same subcategory.
 */
export async function resolveShopifyTaxonomyId(
  admin: AdminApiContext,
  category: string | null,
): Promise<string | null> {
  if (!category) return null;

  const { sub } = parseCategory(category);
  // Try direct lookup first (new format), then sub from parsed legacy format
  const key = TAXONOMY_SEARCH_TERMS[category] ?? (sub ? TAXONOMY_SEARCH_TERMS[sub] : null) ?? category;
  const searchTerm = key;

  // Check cache (including null = "not found" results)
  if (taxonomyCache.has(searchTerm)) return taxonomyCache.get(searchTerm) ?? null;

  try {
    const response = await admin.graphql(
      `#graphql
      query taxonomySearch($search: String!) {
        taxonomy {
          categories(search: $search, first: 1) {
            nodes { id fullName }
          }
        }
      }`,
      { variables: { search: searchTerm } },
    );

    const { data } = await response.json();
    const node = data.taxonomy.categories.nodes[0];
    const id = node?.id ?? null;
    taxonomyCache.set(searchTerm, id);
    return id;
  } catch (err) {
    logger.error("Taxonomy resolution failed", { error: err instanceof Error ? err.message : String(err), searchTerm });
    return null;
  }
}

/**
 * Search Shopify's taxonomy for categories matching a query string.
 * Used by the UI search dropdown for manual override.
 */
export async function searchShopifyTaxonomy(
  admin: AdminApiContext,
  query: string,
): Promise<Array<{ id: string; fullName: string }>> {
  const response = await admin.graphql(
    `#graphql
    query taxonomySearch($search: String!) {
      taxonomy {
        categories(search: $search, first: 10) {
          nodes { id fullName }
        }
      }
    }`,
    { variables: { search: query } },
  );

  const { data } = await response.json();
  return data.taxonomy.categories.nodes;
}
