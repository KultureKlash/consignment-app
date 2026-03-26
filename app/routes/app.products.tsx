import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useSearchParams, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { queryProducts } from "~/services/products.server";
import { MAIN_CATEGORIES } from "~/lib/categories";
import { thStyle, tdStyle, searchInputStyle, searchIconWrap, handleFocus, handleBlurStyle } from "~/lib/listing-ui";
import Pagination from "~/components/Pagination";
import CustomSelect from "~/components/CustomSelect";
import { Search, Package, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const category = url.searchParams.get("category") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const result = await queryProducts({
    search: search || undefined,
    category: category || undefined,
    page,
    limit: 25,
  });

  return { ...result, filters: { search, category } };
};

export default function ProductsPage() {
  const { products, total, page, totalPages, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  const [searchValue, setSearchValue] = useState(filters.search);

  useEffect(() => {
    setSearchValue(filters.search);
  }, [filters.search]);

  // Debounced search
  useEffect(() => {
    if (searchValue === filters.search) return;
    const timer = setTimeout(() => {
      updateParams({ search: searchValue, page: "1" });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchValue]);

  function updateParams(updates: Record<string, string>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    });
  }

  const hasFilters = filters.search || filters.category;

  return (
    <s-page title="Product Catalog">
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>
        {/* Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end", marginBottom: "16px" }}>
          {/* Search */}
          <div style={{ flex: "1 1 280px", position: "relative" }}>
            <span style={searchIconWrap}><Search size={16} /></span>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlurStyle}
              placeholder="Search by title, brand, or style ID..."
              style={searchInputStyle}
            />
          </div>

          {/* Category */}
          <div style={{ flex: "0 0 170px" }}>
            <CustomSelect
              options={MAIN_CATEGORIES}
              value={filters.category}
              onChange={(val) => updateParams({ category: val === filters.category ? "" : val, page: "1" })}
              placeholder="Category"
            />
          </div>

          {/* Clear */}
          {hasFilters && (
            <span
              onClick={() => {
                setSearchValue("");
                updateParams({ search: "", category: "", page: "1" });
              }}
              style={{ fontSize: "13px", color: "#4f46e5", fontWeight: 500, cursor: "pointer", padding: "10px 0" }}
            >
              Clear filters
            </span>
          )}
        </div>

        {/* Loading overlay */}
        <div style={{ opacity: isLoading ? 0.5 : 1, transition: "opacity 0.15s", pointerEvents: isLoading ? "none" : "auto" }}>
          {products.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#6d7175" }}>
              <Package size={40} style={{ marginBottom: "12px", opacity: 0.4 }} />
              <p style={{ fontSize: "15px", fontWeight: 500 }}>No products found</p>
              <p style={{ fontSize: "13px" }}>Try adjusting your search or filters.</p>
            </div>
          ) : (
            <div style={{ background: "white", borderRadius: "12px", border: "1px solid #e2e5ea", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e5ea" }}>
                    <th style={{ ...thStyle, width: "44px" }}></th>
                    <th style={thStyle}>Product</th>
                    <th style={thStyle}>Brand</th>
                    <th style={thStyle}>Category</th>
                    <th style={thStyle}>Style ID</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Variants</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Active</th>
                    <th style={{ ...thStyle, width: "32px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, i) => (
                    <tr
                      key={product.id}
                      onClick={() => (window.location.href = `/app/products/${product.id}`)}
                      style={{
                        borderBottom: i < products.length - 1 ? "1px solid #f1f2f4" : "none",
                        cursor: "pointer",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fb")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* Thumbnail */}
                      <td style={{ ...tdStyle, width: "44px", padding: "8px" }}>
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt=""
                            style={{ width: 36, height: 36, borderRadius: "6px", objectFit: "cover", border: "1px solid #e5e7eb" }}
                          />
                        ) : (
                          <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: "6px",
                            background: "#f3f4f6",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "1px solid #e5e7eb",
                          }}>
                            <Package size={16} style={{ color: "#9ca3af" }} />
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{product.title}</td>
                      <td style={{ ...tdStyle, color: "#6d7175" }}>{product.brand || "—"}</td>
                      <td style={{ ...tdStyle, color: "#6d7175", fontSize: "12px" }}>{product.category || "—"}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px", color: "#6d7175" }}>
                        {product.styleId || "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>{product.variantCount}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          fontSize: "11px",
                          fontWeight: 600,
                          borderRadius: "9999px",
                          background: product.activeListings > 0 ? "#e4f5e9" : "#f6f6f7",
                          color: product.activeListings > 0 ? "#1a7f37" : "#6d7175",
                          border: `1px solid ${product.activeListings > 0 ? "#b7e4c7" : "#e3e3e3"}`,
                        }}>
                          {product.activeListings}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <ChevronRight size={16} style={{ color: "#9ca3af" }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={25}
            onPageChange={(p) => updateParams({ page: String(p) })}
          />
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
