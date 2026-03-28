import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { parseCategory } from "~/lib/categories";

// In-memory cache: search term → taxonomy GID (survives across requests within same process)
const taxonomyCache = new Map<string, string | null>();

// Maps our subcategory names to Shopify taxonomy search terms
const TAXONOMY_SEARCH_TERMS: Record<string, string> = {
  "Sneakers": "sneakers",
  "Athletic Shoes": "athletic shoes",
  "Boots": "boots",
  "Sandals": "sandals",
  "Slides": "slides",
  "Loafers": "loafers",
  "Heels": "heels",
  "T-Shirts": "t-shirts",
  "Hoodies": "hoodies",
  "Sweatshirts": "sweatshirts",
  "Sweaters": "sweaters",
  "Puffer Jackets": "puffer jackets",
  "Parkas": "parkas",
  "Vests": "vests",
  "Jeans": "jeans",
  "Jogger Shorts": "shorts",
  "Outfit Sets": "clothing sets",
  "Varsity Jacket": "varsity jackets",
  "Bags": "bags",
  "Wallets": "wallets",
  "Belts": "belts",
  "Sunglasses": "sunglasses",
  "Jewelry": "jewelry",
  "Watches": "watches",
  "Hats": "hats",
  "Caps": "caps",
  "Beanies": "beanies",
  "Bucket Hats": "bucket hats",
  "Fitted Hats": "fitted hats",
  "Snapbacks": "snapbacks",
};

/**
 * Resolve our local category (e.g. "Footwear > Sneakers") to a Shopify taxonomy GID.
 * Uses in-memory cache to avoid repeated API calls for the same subcategory.
 */
export async function resolveShopifyTaxonomyId(
  admin: AdminApiContext,
  category: string | null,
): Promise<string | null> {
  if (!category) return null;

  const { main, sub } = parseCategory(category);
  const searchTerm = sub ? (TAXONOMY_SEARCH_TERMS[sub] ?? sub) : main;

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
    console.error("Taxonomy resolution failed:", err);
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
