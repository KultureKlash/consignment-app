import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { parseCategory } from "~/lib/categories";
import { logger } from "~/lib/logger.server";

// In-memory cache: search term → taxonomy GID (survives across requests within same process)
const taxonomyCache = new Map<string, string | null>();

// Maps our subcategory names to Shopify taxonomy search terms.
// All terms must resolve under "Apparel & Accessories" in Shopify's taxonomy.
// Many bare keywords (jeans, pants, shorts, t-shirts) match Shopify's
// "Baby & Toddler" sub-tree FIRST — we add disambiguating words to bias
// toward the adult Clothing tree. As a backstop, resolveShopifyTaxonomyId
// also filters BLOCKED_PATH_KEYWORDS out of the result list below.
const TAXONOMY_SEARCH_TERMS: Record<string, string> = {
  // Footwear
  "Sneakers": "sneakers",
  "Slides": "sandals",
  "Boots": "boots",
  // Apparel — disambiguating words ("clothing", "men", explicit category)
  // bias toward the adult Apparel > Clothing tree.
  "T-Shirts": "tees shirts tops",
  "Long Sleeves": "tees shirts tops",
  "Hoodies": "hoodies clothing",
  "Sweatshirts": "sweatshirts clothing",
  "Sweaters": "sweaters clothing",
  "Jackets": "coats jackets clothing",
  "Puffer Jackets": "coats jackets clothing",
  "Varsity Jackets": "coats jackets clothing",
  "Vests": "vests clothing",
  "Jeans": "jeans denim clothing",
  "Pants": "pants clothing",
  "Sweatpants": "pants clothing",
  "Shorts": "shorts clothing",
  "Jerseys": "tees shirts tops",
  "Polos": "polo shirts clothing",
  "Tracksuits": "outerwear clothing",
  // Accessories
  "Handbags": "handbags",
  "Saddle Bags": "handbags",
  "Messenger Bags": "handbags",
  "Backpacks": "backpacks",
  "Pouches": "handbags",
  "Wallets": "wallets",
  "Card Holders": "wallets",
  "Belts": "belts clothing",
  "Sunglasses": "sunglasses",
  // Headwear
  "Caps": "hats clothing",
  "Beanies": "hats clothing",
  "Bucket Hats": "hats clothing",
  "Fitted Hats": "hats clothing",
  "Snapbacks": "hats clothing",
  "Trucker Hats": "hats clothing",
};

// Reject ANY Shopify category whose path contains these words — we never want
// to assign a Konsign product to the Baby & Toddler / Children / Kids subtree.
// Match case-insensitively against the full path string returned by Shopify.
const BLOCKED_PATH_KEYWORDS = ["baby", "toddler", "children", "kids", "infant", "juniors"];

export function isBlockedPath(fullName: string): boolean {
  const lower = fullName.toLowerCase();
  return BLOCKED_PATH_KEYWORDS.some((kw) => lower.includes(kw));
}

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
    // Fetch the top 10 candidates and filter out Baby/Toddler/Children
    // subtree matches. Shopify search often returns those FIRST for bare
    // keywords like "jeans" or "pants".
    const response = await admin.graphql(
      `#graphql
      query taxonomySearch($search: String!) {
        taxonomy {
          categories(search: $search, first: 10) {
            nodes { id fullName }
          }
        }
      }`,
      { variables: { search: searchTerm } },
    );

    const { data } = await response.json();
    const nodes: Array<{ id: string; fullName: string }> = data?.taxonomy?.categories?.nodes ?? [];
    const adultMatch = nodes.find((n) => !isBlockedPath(n.fullName));
    const id = adultMatch?.id ?? null;
    if (!id && nodes.length > 0) {
      // Every result was a kids/baby category — log so we can tighten the search term.
      logger.warn("Taxonomy search returned only kids/baby matches; leaving category unassigned", {
        searchTerm,
        candidates: nodes.map((n) => n.fullName),
      });
    }
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
