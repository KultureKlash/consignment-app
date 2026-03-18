import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { createListing, cancelListing } from "~/services/listings.server";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const [consignors, listings] = await Promise.all([
    prisma.consignor.findMany({ orderBy: { name: "asc" } }),
    prisma.listing.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: {
        consignor: true,
        variant: { include: { product: true } },
      },
    }),
  ]);

  return { consignors, listings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    switch (intent) {
      case "create": {
        const styleId = (formData.get("styleId") as string ?? "").trim().toUpperCase();
        const title = (formData.get("title") as string ?? "").trim();
        const brand = (formData.get("brand") as string ?? "").trim() || undefined;
        const size = (formData.get("size") as string ?? "").trim();
        const gtin = (formData.get("gtin") as string ?? "").trim();
        const priceRaw = formData.get("price") as string;
        const quantityRaw = formData.get("quantity") as string;
        const consignorId = formData.get("consignorId") as string;

        if (!consignorId || !styleId || !title || !size) {
          return { error: "Consignor, Style ID, Title, and Size are required", intent };
        }
        if (!gtin) {
          return { error: "GTIN (barcode) is required", intent };
        }

        const price = Number(priceRaw);
        if (isNaN(price) || price <= 0) {
          return { error: "Price must be greater than 0", intent };
        }

        const quantity = parseInt(quantityRaw, 10) || 1;
        if (quantity < 1 || quantity > 50) {
          return { error: "Quantity must be between 1 and 50", intent };
        }

        const consignor = await prisma.consignor.findUnique({ where: { id: consignorId } });
        if (!consignor) {
          return { error: "Consignor not found", intent };
        }

        const listing = await createListing({
          admin, styleId, title, brand, size, gtin, price, count: quantity, consignorId,
        });

        return { listing, intent, quantity };
      }

      case "cancel": {
        const listing = await cancelListing({
          admin,
          listingId: formData.get("listingId") as string,
        });
        return { listing, intent };
      }

      default:
        throw new Error("Invalid intent");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: message, intent };
  }
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: "14px",
  borderRadius: "6px",
  border: "1px solid #ccc",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  marginBottom: "4px",
};

type ProductResult = {
  id: string;
  styleId: string;
  title: string;
  brand: string | null;
  variants: Array<{ id: string; size: string; gtin: string }>;
};

export default function Inventory() {
  const { consignors, listings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [selectedConsignor, setSelectedConsignor] = useState("");
  const [consignorSearch, setConsignorSearch] = useState("");
  const [showConsignorResults, setShowConsignorResults] = useState(false);

  const selectedConsignorObj = consignors.find((c) => c.id === selectedConsignor);

  const filteredConsignors = consignorSearch.trim()
    ? consignors.filter((c) =>
        c.name.toLowerCase().includes(consignorSearch.toLowerCase()) ||
        c.email.toLowerCase().includes(consignorSearch.toLowerCase())
      )
    : consignors;
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(null);
  const [gtinLocked, setGtinLocked] = useState(false);
  const [newSizeMode, setNewSizeMode] = useState(false);
  const [newProductMode, setNewProductMode] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductResult[]>([]);
  const [formFields, setFormFields] = useState({
    styleId: "", title: "", brand: "", size: "", gtin: "", price: "", quantity: "1",
  });

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  // Debounced product search
  useEffect(() => {
    if (!productSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(`/app/api/products?q=${encodeURIComponent(productSearch)}`);
      const data = await res.json();
      setSearchResults(data.products);
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  // Handle action responses
  useEffect(() => {
    const data = fetcher.data as Record<string, unknown> | undefined;
    if (!data) return;

    if (data.error) {
      shopify.toast.show(data.error as string);
      return;
    }

    const intent = data.intent as string;
    if (intent === "create") {
      const qty = (data as Record<string, unknown>).quantity ?? 1;
      shopify.toast.show(`${qty} listing(s) created`);
      setFormFields({ styleId: "", title: "", brand: "", size: "", gtin: "", price: "", quantity: "1" });
      setSelectedProductId(null);
      setSelectedProduct(null);
      setGtinLocked(false);
      setNewSizeMode(false);
      setNewProductMode(false);
      setProductSearch("");
    } else if (intent === "cancel") {
      shopify.toast.show("Listing cancelled");
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Inventory">
      {/* Create Listing */}
      <s-section heading="Create Listing">
        {/* Consignor selector */}
        <div style={{ marginBottom: "12px" }}>
          <label style={labelStyle}>Consignor *</label>
          {consignors.length === 0 ? (
            <s-paragraph>No consignors found. Add one in the Consignors page.</s-paragraph>
          ) : selectedConsignorObj ? (
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "8px 12px", background: "#e8f4fd", border: "1px solid #b3d9f2",
              borderRadius: "6px", fontSize: "14px",
            }}>
              <span style={{ flex: 1 }}>
                {selectedConsignorObj.name} ({(selectedConsignorObj.commissionRate * 100).toFixed(0)}%) — {selectedConsignorObj.email}
              </span>
              <span
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSelectedConsignor("");
                  setConsignorSearch("");
                }}
                style={{ cursor: "pointer", fontSize: "16px", color: "#666", fontWeight: "bold" }}
              >
                ✕
              </span>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={consignorSearch}
                onChange={(e) => {
                  setConsignorSearch(e.target.value);
                  setShowConsignorResults(true);
                }}
                onFocus={() => setShowConsignorResults(true)}
                onBlur={() => setTimeout(() => setShowConsignorResults(false), 150)}
                placeholder="Search consignor by name or email..."
                style={inputStyle}
              />
              {showConsignorResults && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                  background: "white", border: "1px solid #ccc", borderRadius: "6px",
                  maxHeight: "200px", overflowY: "auto", marginTop: "2px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}>
                  {filteredConsignors.map((c) => (
                    <div
                      key={c.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedConsignor(c.id);
                        setConsignorSearch("");
                        setShowConsignorResults(false);
                      }}
                      style={{
                        padding: "8px 12px", cursor: "pointer", fontSize: "14px",
                        borderBottom: "1px solid #f0f0f0",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                    >
                      {c.name} ({(c.commissionRate * 100).toFixed(0)}%) — {c.email}
                    </div>
                  ))}
                  {consignorSearch.trim() && filteredConsignors.length === 0 && (
                    <div style={{ padding: "8px 12px", color: "#999", fontSize: "13px" }}>
                      No consignors found
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {/* Product selector */}
        <div style={{ marginBottom: "12px" }}>
          <label style={labelStyle}>Product</label>

          {/* State A: Product selected — show chip */}
          {selectedProductId && selectedProduct && (
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "8px 12px", background: "#e8f4fd", border: "1px solid #b3d9f2",
              borderRadius: "6px", fontSize: "14px",
            }}>
              <span style={{ flex: 1 }}>
                {selectedProduct.title} ({selectedProduct.styleId})
                {selectedProduct.brand ? ` — ${selectedProduct.brand}` : ""}
              </span>
              <span
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSelectedProductId(null);
                  setSelectedProduct(null);
                  setGtinLocked(false);
                  setNewSizeMode(false);
                  setProductSearch("");
                  setFormFields({ styleId: "", title: "", brand: "", size: "", gtin: "", price: "", quantity: "1" });
                }}
                style={{ cursor: "pointer", fontSize: "16px", color: "#666", fontWeight: "bold" }}
              >
                ✕
              </span>
            </div>
          )}

          {/* State B: New product mode — show editable fields */}
          {!selectedProductId && newProductMode && (
            <>
              <div style={{ marginBottom: "8px" }}>
                <span
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setNewProductMode(false);
                    setFormFields({ ...formFields, styleId: "", title: "", brand: "" });
                  }}
                  style={{ cursor: "pointer", color: "#2c6ecb", fontSize: "13px" }}
                >
                  ← Back to search
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Style ID *</label>
                  <input
                    type="text"
                    value={formFields.styleId}
                    onChange={(e) => setFormFields({ ...formFields, styleId: e.target.value })}
                    placeholder="e.g. DD1391-100"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Title *</label>
                  <input
                    type="text"
                    value={formFields.title}
                    onChange={(e) => setFormFields({ ...formFields, title: e.target.value })}
                    placeholder="e.g. Nike Dunk Panda"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Brand</label>
                  <input
                    type="text"
                    value={formFields.brand}
                    onChange={(e) => setFormFields({ ...formFields, brand: e.target.value })}
                    placeholder="e.g. Nike"
                    style={inputStyle}
                  />
                </div>
              </div>
            </>
          )}

          {/* State C: Search mode — show search input + dropdown */}
          {!selectedProductId && !newProductMode && (
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setShowResults(true);
                }}
                onFocus={() => setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 150)}
                placeholder="Search by name or style ID..."
                style={inputStyle}
              />
              {showResults && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                  background: "white", border: "1px solid #ccc", borderRadius: "6px",
                  maxHeight: "200px", overflowY: "auto", marginTop: "2px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}>
                  {searchResults.map((p) => (
                    <div
                      key={p.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedProductId(p.id);
                        setSelectedProduct(p);
                        setProductSearch("");
                        setShowResults(false);
                        setGtinLocked(false);
                        setNewSizeMode(false);
                        setFormFields({
                          ...formFields,
                          styleId: p.styleId,
                          title: p.title,
                          brand: p.brand ?? "",
                          size: "", gtin: "", price: "", quantity: "1",
                        });
                      }}
                      style={{
                        padding: "8px 12px", cursor: "pointer", fontSize: "14px",
                        borderBottom: "1px solid #f0f0f0",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                    >
                      {p.title} ({p.styleId}){p.brand ? ` — ${p.brand}` : ""}
                    </div>
                  ))}
                  {productSearch.trim() && searchResults.length === 0 && (
                    <div style={{ padding: "8px 12px", color: "#999", fontSize: "13px" }}>
                      No products found
                    </div>
                  )}
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setNewProductMode(true);
                      setProductSearch("");
                      setShowResults(false);
                    }}
                    style={{
                      padding: "8px 12px", cursor: "pointer", fontSize: "14px",
                      color: "#2c6ecb", fontWeight: 600,
                      borderTop: "1px solid #ddd",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                  >
                    + Add new product
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Variant details: Size → GTIN → Price → Quantity */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          <div>
            <label style={labelStyle}>Size *</label>
            {selectedProduct && !newSizeMode ? (
              <select
                value={formFields.size}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__new") {
                    setNewSizeMode(true);
                    setFormFields({ ...formFields, size: "", gtin: "" });
                    setGtinLocked(false);
                    return;
                  }
                  const existingVariant = selectedProduct.variants.find((v) => v.size === val);
                  const variantGtin = existingVariant?.gtin ?? "";
                  setFormFields({ ...formFields, size: val, gtin: variantGtin });
                  setGtinLocked(variantGtin.length > 0);
                }}
                style={inputStyle}
              >
                <option value="">Select size...</option>
                {selectedProduct.variants.map((v) => (
                  <option key={v.id} value={v.size}>{v.size}</option>
                ))}
                <option value="__new">+ New size</option>
              </select>
            ) : (
              <input
                type="text"
                value={formFields.size}
                onChange={(e) => setFormFields({ ...formFields, size: e.target.value })}
                placeholder="e.g. 9"
                style={inputStyle}
              />
            )}
          </div>
          <div>
            <label style={labelStyle}>GTIN (barcode) *</label>
            <input
              type="text"
              value={formFields.gtin}
              onChange={(e) => setFormFields({ ...formFields, gtin: e.target.value })}
              placeholder="e.g. 194956806653"
              disabled={gtinLocked}
              style={{ ...inputStyle, ...(gtinLocked ? { background: "#f0f0f0" } : {}) }}
            />
          </div>
          <div>
            <label style={labelStyle}>Price ($) *</label>
            <input
              type="number"
              value={formFields.price}
              onChange={(e) => setFormFields({ ...formFields, price: e.target.value })}
              placeholder="e.g. 340"
              min="1"
              step="1"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Quantity</label>
            <input
              type="number"
              value={formFields.quantity}
              onChange={(e) => setFormFields({ ...formFields, quantity: e.target.value })}
              min="1"
              max="50"
              step="1"
              style={inputStyle}
            />
          </div>
        </div>

        <s-button
          variant="primary"
          onClick={() => {
            fetcher.submit(
              { intent: "create", consignorId: selectedConsignor, ...formFields },
              { method: "POST" }
            );
          }}
          {...(isLoading ? { disabled: true } : {})}
        >
          {isLoading ? "Creating..." : "Create Listing"}
        </s-button>
      </s-section>

      {/* Listings table */}
      <s-section heading={`Listings (${listings.length})`}>
        {listings.length === 0 ? (
          <s-paragraph>No listings yet.</s-paragraph>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
                <th style={{ padding: "6px" }}>Product</th>
                <th style={{ padding: "6px" }}>Size</th>
                <th style={{ padding: "6px" }}>Price</th>
                <th style={{ padding: "6px" }}>Consignor</th>
                <th style={{ padding: "6px" }}>Status</th>
                <th style={{ padding: "6px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "6px" }}>{l.variant.product.title}</td>
                  <td style={{ padding: "6px" }}>{l.variant.size}</td>
                  <td style={{ padding: "6px" }}>${l.price}</td>
                  <td style={{ padding: "6px" }}>{l.consignor.name}</td>
                  <td style={{ padding: "6px" }}>{l.status}</td>
                  <td style={{ padding: "6px" }}>
                    {l.status === "active" ? (
                      <s-button
                        tone="critical"
                        size="slim"
                        onClick={() => {
                          fetcher.submit({ intent: "cancel", listingId: l.id }, { method: "POST" });
                        }}
                        {...(isLoading ? { disabled: true } : {})}
                      >
                        Cancel
                      </s-button>
                    ) : (
                      <span style={{ color: "#999", fontSize: "12px" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
