import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { parseCategory } from "~/lib/categories";

// In-memory cache: search term → taxonomy GID (survives across requests within same process)
const taxonomyCache = new Map<string, string | null>();

// Maps our subcategory names to Shopify taxonomy search terms
// All terms must resolve under "Apparel & Accessories" in Shopify's taxonomy
const TAXONOMY_SEARCH_TERMS: Record<string, string> = {
  // Footwear — all under Apparel & Accessories > Shoes
  "Sneakers": "apparel accessories shoes sneakers",
  "Athletic Shoes": "apparel accessories shoes athletic",
  "Boots": "apparel accessories shoes boots",
  "Sandals": "apparel accessories shoes sandals",
  "Slides": "apparel accessories shoes sandals",
  "Loafers": "apparel accessories shoes loafers",
  "Heels": "apparel accessories shoes heels",
  // Apparel — all under Apparel & Accessories > Clothing
  "T-Shirts": "apparel accessories clothing shirts tops",
  "Long Sleeves": "apparel accessories clothing shirts tops",
  "Hoodies": "apparel accessories clothing outerwear hoodies",
  "Sweatshirts": "apparel accessories clothing outerwear",
  "Sweaters": "apparel accessories clothing sweaters",
  "Jackets": "apparel accessories clothing outerwear coats jackets",
  "Puffer Jackets": "apparel accessories clothing outerwear coats jackets",
  "Parkas": "apparel accessories clothing outerwear coats jackets",
  "Varsity Jackets": "apparel accessories clothing outerwear coats jackets",
  "Vests": "apparel accessories clothing outerwear vests",
  "Jeans": "apparel accessories clothing pants jeans",
  "Pants": "apparel accessories clothing pants",
  "Sweatpants": "apparel accessories clothing pants",
  "Shorts": "apparel accessories clothing shorts",
  "Jogger Shorts": "apparel accessories clothing shorts",
  "Jerseys": "apparel accessories clothing shirts tops",
  "Polos": "apparel accessories clothing shirts tops",
  "Outfit Sets": "apparel accessories clothing sets",
  // Accessories — all under Apparel & Accessories > Accessories
  "Bags": "apparel accessories handbags wallets cases bags",
  "Wallets": "apparel accessories handbags wallets",
  "Belts": "apparel accessories belts",
  "Sunglasses": "apparel accessories eyewear sunglasses",
  "Jewelry": "apparel accessories jewelry",
  "Watches": "apparel accessories jewelry watches",
  // Headwear — all under Apparel & Accessories > Clothing Accessories > Hats
  "Caps": "apparel accessories clothing accessories hats caps",
  "Beanies": "apparel accessories clothing accessories hats caps",
  "Bucket Hats": "apparel accessories clothing accessories hats caps",
  "Fitted Hats": "apparel accessories clothing accessories hats caps",
  "Snapbacks": "apparel accessories clothing accessories hats caps",
  "Trucker Hats": "apparel accessories clothing accessories hats caps",
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
