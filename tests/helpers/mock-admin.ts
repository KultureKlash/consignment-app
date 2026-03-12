import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { vi } from "vitest";

// Tracks all GraphQL calls made during a test
type GraphQLCall = { query: string; variables?: Record<string, unknown> };

/**
 * Creates a mock Shopify Admin API client.
 * Responds to known mutations/queries with realistic fake data.
 */
export function createMockAdmin() {
  const calls: GraphQLCall[] = [];
  let productCounter = 1;
  let variantCounter = 1;
  let inventoryItemCounter = 1;

  const graphql = vi.fn(async (query: string, options?: { variables?: Record<string, unknown> }) => {
    calls.push({ query, variables: options?.variables });

    // Publications query
    if (query.includes("publications(")) {
      return mockResponse({
        publications: {
          nodes: [
            { id: "gid://shopify/Publication/1", name: "Online Store" },
            { id: "gid://shopify/Publication/2", name: "Shop" },
          ],
        },
      });
    }

    // Location query
    if (query.includes("locations(")) {
      return mockResponse({
        locations: {
          nodes: [{ id: "gid://shopify/Location/1001" }],
        },
      });
    }

    // Product create
    if (query.includes("productCreate")) {
      const pid = `gid://shopify/Product/${productCounter++}`;
      const vid = `gid://shopify/ProductVariant/${variantCounter++}`;
      const iid = `gid://shopify/InventoryItem/${inventoryItemCounter++}`;
      return mockResponse({
        productCreate: {
          product: {
            id: pid,
            variants: {
              nodes: [{ id: vid, inventoryItem: { id: iid } }],
            },
          },
          userErrors: [],
        },
      });
    }

    // Variant bulk create
    if (query.includes("productVariantsBulkCreate")) {
      const vid = `gid://shopify/ProductVariant/${variantCounter++}`;
      const iid = `gid://shopify/InventoryItem/${inventoryItemCounter++}`;
      return mockResponse({
        productVariantsBulkCreate: {
          productVariants: [{ id: vid, inventoryItem: { id: iid } }],
          userErrors: [],
        },
      });
    }

    // Publishable publish (publish to sales channels)
    if (query.includes("publishablePublish")) {
      return mockResponse({
        publishablePublish: { userErrors: [] },
      });
    }

    // Inventory item update (tracked: true)
    if (query.includes("inventoryItemUpdate")) {
      return mockResponse({
        inventoryItemUpdate: { userErrors: [] },
      });
    }

    // Inventory set quantities
    if (query.includes("inventorySetQuantities")) {
      return mockResponse({
        inventorySetQuantities: {
          inventoryAdjustmentGroup: { reason: "correction" },
          userErrors: [],
        },
      });
    }

    // Product variants bulk delete (remove out-of-stock variants)
    if (query.includes("productVariantsBulkDelete")) {
      return mockResponse({
        productVariantsBulkDelete: { userErrors: [] },
      });
    }

    // Product variants bulk update (price sync)
    if (query.includes("productVariantsBulkUpdate")) {
      return mockResponse({
        productVariantsBulkUpdate: {
          productVariants: [{ id: "gid://shopify/ProductVariant/1" }],
          userErrors: [],
        },
      });
    }

    // Default: empty success
    return mockResponse({});
  });

  const admin = { graphql } as unknown as AdminApiContext;

  return {
    admin,
    graphql,
    calls,
    /** Get the variables from the Nth graphql call (0-indexed) */
    getCallVariables: (index: number) => calls[index]?.variables,
    /** Find calls matching a query substring */
    findCalls: (substring: string) => calls.filter((c) => c.query.includes(substring)),
  };
}

function mockResponse(data: Record<string, unknown>) {
  return {
    json: async () => ({ data }),
  };
}
