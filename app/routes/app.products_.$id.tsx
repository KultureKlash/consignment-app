import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getProductDetail, updateProduct, updateVariantGtin, mergeProducts } from "~/services/products.server";
import prisma from "~/db.server";
import { inputStyle, labelStyle, thStyle, tdStyle, handleFocus, handleBlurStyle, searchInputStyle, searchIconWrap } from "~/lib/listing-ui";
import { MAIN_CATEGORIES, CATEGORIES } from "~/lib/categories";
import CustomSelect from "~/components/CustomSelect";
import { ArrowLeft, Package, Search, GitMerge, Pencil, Check, X, AlertTriangle } from "lucide-react";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const id = params.id!;
  const product = await getProductDetail(id);
  return { product };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = params.id!;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "update") {
      const title = (formData.get("title") as string ?? "").trim();
      const brand = (formData.get("brand") as string ?? "").trim();
      const category = (formData.get("category") as string ?? "").trim();
      const styleId = (formData.get("styleId") as string ?? "").trim();

      if (!title) return { error: "Title is required", intent };

      await updateProduct(id, {
        title,
        brand: brand || undefined,
        category: category || undefined,
        styleId: styleId || null,
      });

      // Best-effort Shopify re-sync for active listings
      try {
        const variants = await prisma.variant.findMany({
          where: { productId: id, listings: { some: { status: "active" } } },
          select: { shopifyVariantId: true },
        });
        if (variants.length > 0 && variants[0].shopifyVariantId) {
          const { ensureShopifyProductAndVariant } = await import("~/services/shopify-products.server");
          const product = await prisma.product.findUnique({ where: { id }, include: { variants: { take: 1 } } });
          if (product && product.variants[0]) {
            await ensureShopifyProductAndVariant({
              admin,
              product,
              variant: product.variants[0],
            });
          }
        }
      } catch (err) {
        console.error("Shopify re-sync failed:", err);
      }

      return { success: true, intent, message: "Product updated" };
    }

    if (intent === "updateGtin") {
      const variantId = formData.get("variantId") as string;
      const gtin = (formData.get("gtin") as string ?? "").trim();
      await updateVariantGtin(variantId, gtin || null);
      return { success: true, intent, message: "GTIN updated" };
    }

    if (intent === "merge") {
      const sourceId = formData.get("sourceId") as string;
      if (!sourceId) return { error: "Select a product to merge", intent };
      const force = formData.get("force") === "true";

      const result = await mergeProducts(id, sourceId, { force });

      // Best-effort: delete the orphaned Shopify product
      if (result.deletedShopifyProductId) {
        try {
          await admin.graphql(
            `#graphql
            mutation productDelete($input: ProductDeleteInput!) {
              productDelete(input: $input) {
                deletedProductId
              }
            }`,
            { variables: { input: { id: result.deletedShopifyProductId } } },
          );
        } catch (err) {
          console.error("Failed to delete source Shopify product:", err);
        }
      }

      // Best-effort Shopify sync for affected variants
      for (const variantId of result.affectedVariantIds) {
        try {
          const { syncInventory } = await import("~/services/inventory.server");
          const variant = await prisma.variant.findUnique({ where: { id: variantId } });
          if (variant) await syncInventory({ admin, variant });
        } catch (err) {
          console.error(`Shopify sync failed for variant ${variantId}:`, err);
        }
      }

      return { success: true, intent, message: "Products merged successfully" };
    }

    throw new Error("Invalid intent");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message, intent };
  }
};

// ── Styles ────────────────────────────────────────────

const sectionCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(227,227,227,0.6)",
  borderRadius: "12px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  overflow: "hidden",
};

const sectionHeader: React.CSSProperties = {
  padding: "16px 24px",
  borderBottom: "1px solid rgba(227,227,227,0.5)",
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  color: "#1a1a1a",
  margin: 0,
};

const sectionBody: React.CSSProperties = {
  padding: "20px 24px",
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 18px",
  fontSize: "13px",
  fontWeight: 600,
  borderRadius: "8px",
  border: "none",
  background: "#111827",
  color: "white",
  cursor: "pointer",
  transition: "background 0.15s",
  fontFamily: "inherit",
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 18px",
  fontSize: "13px",
  fontWeight: 500,
  borderRadius: "8px",
  border: "1px solid #e2e5ea",
  background: "white",
  color: "#1a1a1a",
  cursor: "pointer",
  transition: "background 0.15s",
  fontFamily: "inherit",
};

// ── Component ─────────────────────────────────────────

export default function ProductDetailPage() {
  const { product } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  // Edit form state
  const [title, setTitle] = useState(product.title);
  const [brand, setBrand] = useState(product.brand ?? "");
  const [category, setCategory] = useState(product.category ?? "");
  const [styleId, setStyleId] = useState(product.styleId ?? "");

  // GTIN editing state
  const [editingGtin, setEditingGtin] = useState<string | null>(null);
  const [gtinValue, setGtinValue] = useState("");

  // Merge state
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeResults, setMergeResults] = useState<Array<{ id: string; title: string; brand: string | null; variantCount: number }>>([]);
  const [mergeTarget, setMergeTarget] = useState<{ id: string; title: string; brand: string | null } | null>(null);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [brandMismatch, setBrandMismatch] = useState(false);

  // Sync form state when loader data changes (after save)
  useEffect(() => {
    setTitle(product.title);
    setBrand(product.brand ?? "");
    setCategory(product.category ?? "");
    setStyleId(product.styleId ?? "");
  }, [product]);

  // Toast on action result
  useEffect(() => {
    if (fetcher.data && typeof fetcher.data === "object") {
      const data = fetcher.data as any;
      if (data.success && data.message) {
        shopify.toast.show(data.message);
        if (data.intent === "merge") {
          setMergeTarget(null);
          setMergeSearch("");
          setMergeResults([]);
          setBrandMismatch(false);
          setShowMergeConfirm(false);
        }
        if (data.intent === "updateGtin") {
          setEditingGtin(null);
        }
      }
      if (data.error) {
        // Brand mismatch is a soft warning — show confirm option instead of just a toast
        if (data.intent === "merge" && data.error.includes("Brand mismatch")) {
          setBrandMismatch(true);
        } else {
          shopify.toast.show(data.error, { isError: true });
        }
      }
    }
  }, [fetcher.data]);

  const hasChanges =
    title !== product.title ||
    brand !== (product.brand ?? "") ||
    category !== (product.category ?? "") ||
    styleId !== (product.styleId ?? "");

  const isSubmitting = fetcher.state !== "idle";

  // Category parsing
  const categoryParts = category.split(" > ");
  const mainCategory = categoryParts[0] || "";
  const subCategory = categoryParts[1] || "";
  const subOptions = mainCategory ? (CATEGORIES[mainCategory] ?? []) : [];

  // Merge search (debounced)
  useEffect(() => {
    if (!mergeSearch.trim()) {
      setMergeResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/app/api/products?search=${encodeURIComponent(mergeSearch)}&exclude=${product.id}`);
        if (res.ok) {
          const data = await res.json();
          setMergeResults(data.products ?? []);
        }
      } catch { /* ignore */ }
    }, 350);
    return () => clearTimeout(timer);
  }, [mergeSearch]);

  return (
    <s-page
      title={product.title}
      subtitle={[product.brand, product.styleId].filter(Boolean).join(" · ") || undefined}
      backAction={`/app/products`}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

          {/* ── Left: Product Image + Edit Form ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Image */}
            <div style={sectionCard}>
              <div style={sectionHeader}>
                <Package size={16} style={{ color: "#6d7175" }} />
                <h3 style={sectionTitle}>Product Image</h3>
              </div>
              <div style={{ ...sectionBody, display: "flex", justifyContent: "center" }}>
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.title}
                    style={{ width: 200, height: 200, objectFit: "contain", borderRadius: "8px", border: "1px solid #e5e7eb" }}
                  />
                ) : (
                  <div style={{
                    width: 200,
                    height: 200,
                    borderRadius: "8px",
                    background: "#f9fafb",
                    border: "2px dashed #d1d5db",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    color: "#9ca3af",
                  }}>
                    <Package size={40} />
                    <span style={{ fontSize: "13px" }}>No image</span>
                  </div>
                )}
              </div>
            </div>

            {/* Edit Form */}
            <div style={sectionCard}>
              <div style={sectionHeader}>
                <Pencil size={16} style={{ color: "#6d7175" }} />
                <h3 style={sectionTitle}>Product Details</h3>
              </div>
              <div style={sectionBody}>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="update" />
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

                    <div>
                      <label style={labelStyle}>Title</label>
                      <input
                        name="title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onFocus={handleFocus}
                        onBlur={handleBlurStyle}
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Brand</label>
                      <input
                        name="brand"
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        onFocus={handleFocus}
                        onBlur={handleBlurStyle}
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={labelStyle}>Category</label>
                        <CustomSelect
                          options={MAIN_CATEGORIES}
                          value={mainCategory}
                          onChange={(val) => setCategory(val === mainCategory ? "" : val)}
                          placeholder="Select..."
                        />
                      </div>
                      {mainCategory && subOptions.length > 0 && (
                        <div>
                          <label style={labelStyle}>Subcategory</label>
                          <CustomSelect
                            options={subOptions}
                            value={subCategory}
                            onChange={(val) => {
                              if (val === subCategory) {
                                setCategory(mainCategory);
                              } else {
                                setCategory(`${mainCategory} > ${val}`);
                              }
                            }}
                            placeholder="Select..."
                            searchable
                          />
                        </div>
                      )}
                    </div>
                    <input type="hidden" name="category" value={category} />

                    <div>
                      <label style={labelStyle}>Style ID</label>
                      <input
                        name="styleId"
                        value={styleId}
                        onChange={(e) => setStyleId(e.target.value)}
                        onFocus={handleFocus}
                        onBlur={handleBlurStyle}
                        style={inputStyle}
                        placeholder="Optional"
                      />
                    </div>

                    <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", paddingTop: "8px" }}>
                      {hasChanges && (
                        <button
                          type="button"
                          onClick={() => {
                            setTitle(product.title);
                            setBrand(product.brand ?? "");
                            setCategory(product.category ?? "");
                            setStyleId(product.styleId ?? "");
                          }}
                          style={btnSecondary}
                        >
                          Discard
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={!hasChanges || isSubmitting}
                        style={{
                          ...btnPrimary,
                          opacity: !hasChanges || isSubmitting ? 0.5 : 1,
                          cursor: !hasChanges || isSubmitting ? "not-allowed" : "pointer",
                        }}
                      >
                        {isSubmitting && fetcher.formData?.get("intent") === "update" ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </fetcher.Form>
              </div>
            </div>
          </div>

          {/* ── Right: Variants + Merge ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Variants Table */}
            <div style={sectionCard}>
              <div style={sectionHeader}>
                <h3 style={sectionTitle}>
                  Variants ({product.variants.length})
                </h3>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e2e5ea" }}>
                      <th style={thStyle}>Size</th>
                      <th style={thStyle}>GTIN</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Active</th>
                      <th style={{ ...thStyle, width: "60px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants.map((variant, i) => (
                      <tr
                        key={variant.id}
                        style={{ borderBottom: i < product.variants.length - 1 ? "1px solid #f1f2f4" : "none" }}
                      >
                        <td style={{ ...tdStyle, fontWeight: 500 }}>{variant.size}</td>
                        <td style={tdStyle}>
                          {editingGtin === variant.id ? (
                            <fetcher.Form
                              method="post"
                              style={{ display: "flex", gap: "6px", alignItems: "center" }}
                              onSubmit={() => { /* will close on success via effect */ }}
                            >
                              <input type="hidden" name="intent" value="updateGtin" />
                              <input type="hidden" name="variantId" value={variant.id} />
                              <input
                                name="gtin"
                                value={gtinValue}
                                onChange={(e) => setGtinValue(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlurStyle}
                                style={{ ...inputStyle, padding: "4px 8px", fontSize: "12px", width: "140px" }}
                                autoFocus
                              />
                              <button type="submit" style={{ ...btnPrimary, padding: "4px 8px", fontSize: "11px" }}>
                                <Check size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingGtin(null)}
                                style={{ ...btnSecondary, padding: "4px 8px", fontSize: "11px" }}
                              >
                                <X size={12} />
                              </button>
                            </fetcher.Form>
                          ) : (
                            <span
                              style={{ fontFamily: "monospace", fontSize: "12px", color: "#6d7175" }}
                            >
                              {variant.gtin || "—"}
                            </span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <span style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            fontSize: "11px",
                            fontWeight: 600,
                            borderRadius: "9999px",
                            background: variant.activeListings > 0 ? "#e4f5e9" : "#f6f6f7",
                            color: variant.activeListings > 0 ? "#1a7f37" : "#6d7175",
                            border: `1px solid ${variant.activeListings > 0 ? "#b7e4c7" : "#e3e3e3"}`,
                          }}>
                            {variant.activeListings}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          {editingGtin !== variant.id && (
                            <button
                              onClick={() => {
                                setEditingGtin(variant.id);
                                setGtinValue(variant.gtin ?? "");
                              }}
                              style={{ ...btnSecondary, padding: "4px 8px", fontSize: "11px" }}
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {product.variants.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af", padding: "24px" }}>
                          No variants
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Merge Products */}
            <div style={sectionCard}>
              <div style={sectionHeader}>
                <GitMerge size={16} style={{ color: "#6d7175" }} />
                <h3 style={sectionTitle}>Merge Product</h3>
              </div>
              <div style={sectionBody}>
                <p style={{ fontSize: "13px", color: "#6d7175", margin: "0 0 12px 0" }}>
                  Merge another product into this one. All variants and listings from the source product will be moved here.
                </p>

                {!mergeTarget ? (
                  <>
                    <div style={{ position: "relative" }}>
                      <span style={searchIconWrap}><Search size={16} /></span>
                      <input
                        type="text"
                        value={mergeSearch}
                        onChange={(e) => setMergeSearch(e.target.value)}
                        onFocus={handleFocus}
                        onBlur={handleBlurStyle}
                        placeholder="Search for product to merge..."
                        style={searchInputStyle}
                      />
                    </div>
                    {mergeResults.length > 0 && (
                      <div style={{
                        border: "1px solid #e2e5ea",
                        borderRadius: "8px",
                        marginTop: "8px",
                        maxHeight: "200px",
                        overflowY: "auto",
                      }}>
                        {mergeResults.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setMergeTarget(p);
                              setMergeSearch("");
                              setMergeResults([]);
                            }}
                            style={{
                              padding: "10px 14px",
                              cursor: "pointer",
                              borderBottom: "1px solid #f1f2f4",
                              transition: "background 0.1s",
                              fontSize: "13px",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fb")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            <span style={{ fontWeight: 500 }}>{p.title}</span>
                            {p.brand && <span style={{ color: "#6d7175", marginLeft: "6px" }}>— {p.brand}</span>}
                            <span style={{ color: "#9ca3af", marginLeft: "6px", fontSize: "12px" }}>
                              ({p.variantCount} variant{p.variantCount !== 1 ? "s" : ""})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      background: "#fef3cd",
                      border: "1px solid #ffc107",
                      borderRadius: "8px",
                      marginBottom: "12px",
                    }}>
                      <div>
                        <span style={{ fontWeight: 500, fontSize: "13px" }}>{mergeTarget.title}</span>
                        {mergeTarget.brand && (
                          <span style={{ color: "#6d7175", marginLeft: "6px", fontSize: "13px" }}>— {mergeTarget.brand}</span>
                        )}
                      </div>
                      <button
                        onClick={() => setMergeTarget(null)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}
                      >
                        <X size={16} style={{ color: "#6d7175" }} />
                      </button>
                    </div>

                    {!showMergeConfirm ? (
                      <button
                        onClick={() => setShowMergeConfirm(true)}
                        style={{ ...btnPrimary, background: "#dc2626", width: "100%" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#b91c1c")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#dc2626")}
                      >
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                          <GitMerge size={14} /> Merge into this product
                        </span>
                      </button>
                    ) : (
                      <div style={{
                        padding: "14px",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        borderRadius: "8px",
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "12px" }}>
                          <AlertTriangle size={16} style={{ color: "#dc2626", flexShrink: 0, marginTop: "2px" }} />
                          <div style={{ fontSize: "13px", color: "#991b1b" }}>
                            <strong>This cannot be undone.</strong> All variants and listings from "{mergeTarget.title}" will be moved
                            to "{product.title}", and the source product will be deleted.
                          </div>
                        </div>
                        {brandMismatch && (
                          <div style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "8px",
                            padding: "10px 12px",
                            background: "#fff7ed",
                            border: "1px solid #fed7aa",
                            borderRadius: "6px",
                            marginBottom: "12px",
                          }}>
                            <AlertTriangle size={14} style={{ color: "#ea580c", flexShrink: 0, marginTop: "2px" }} />
                            <div style={{ fontSize: "12px", color: "#9a3412" }}>
                              <strong>Brand mismatch:</strong> "{mergeTarget.brand}" → "{product.brand}". Are you sure these are the same product?
                            </div>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: "8px" }}>
                          <fetcher.Form method="post" style={{ flex: 1 }}>
                            <input type="hidden" name="intent" value="merge" />
                            <input type="hidden" name="sourceId" value={mergeTarget.id} />
                            {brandMismatch && <input type="hidden" name="force" value="true" />}
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              style={{ ...btnPrimary, background: "#dc2626", width: "100%" }}
                            >
                              {isSubmitting && fetcher.formData?.get("intent") === "merge"
                                ? "Merging..."
                                : brandMismatch
                                  ? "Merge Anyway"
                                  : "Confirm Merge"}
                            </button>
                          </fetcher.Form>
                          <button
                            onClick={() => { setShowMergeConfirm(false); setBrandMismatch(false); }}
                            style={btnSecondary}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div style={{
              padding: "12px 16px",
              fontSize: "12px",
              color: "#9ca3af",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}>
              <span>ID: {product.id}</span>
              {product.shopifyProductId && <span>Shopify: {product.shopifyProductId}</span>}
              <span>Created: {new Date(product.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
