# Stashed Changes — To Implement Later

These changes were developed but reverted for stability. Re-implement cleanly.

---

## 1. Split Edit Modal (Product vs Listing)

**What**: Separate the edit modal into two:
- **Edit Product** (pencil icon on group header): title, brand, category, styleId, image → updates ALL listings
- **Edit Listing** (Edit button on row): size, gtin, price, cost → updates just that variant/listing

**Files changed**:
- `app/components/admin/ListingsTable.tsx` — new `EditProductModal` component, simplified `EditListingModal` (removed product fields)
- `app/lib/validation.ts` — new `adminEditProductSchema`, simplified `adminEditListingSchema`
- `app/services/submission.server.ts` — new `adminEditProduct()` function
- `app/routes/app.listings.tsx` — new `edit-product` intent, `handleEditProduct`, `onEditProduct` prop

**How**:
- `EditProductModal`: title, brand, category (dropdown with MAIN_CATEGORIES + subcategories), styleId, image upload
- `EditListingModal`: size, gtin, price, cost (if store-owned), consignor info display
- `adminEditProduct()`: `prisma.product.update()` + `updateShopifyProduct()` (syncs title/brand to Shopify)
- Category dropdown uses `CATEGORIES`, `MAIN_CATEGORIES`, `parseCategory` from `~/lib/categories`

---

## 2. Shopify Product Update Mutation

**What**: When admin edits product title/brand/category, sync to Shopify via `productUpdate` mutation.

**Files changed**:
- `app/services/shopify/products.server.ts` — new `updateShopifyProduct()` function

**How**:
```graphql
mutation productUpdate($input: ProductInput!) {
  productUpdate(input: $input) {
    product { id title vendor }
    userErrors { field message }
  }
}
```
Called with `{ id: shopifyProductId, title, vendor, category: taxonomyId }`.

---

## 3. Barcode Sync to Shopify on Edit

**What**: When admin edits a listing's barcode, push the change to Shopify.

**Files changed**:
- `app/services/submission.server.ts` — in `adminEditListing`, after variant update

**How**:
```graphql
mutation variantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id title barcode }
    userErrors { field message }
  }
}
```
Variables: `{ productId: shopifyProductId, variants: [{ id: shopifyVariantId, barcode: gtin }] }`
Only runs if listing is active AND variant has shopifyVariantId AND product has shopifyProductId.

---

## 4. GTIN Uniqueness Check

**What**: Before updating a variant's gtin, check if another variant already has that barcode.

**Files changed**:
- `app/services/submission.server.ts` — in `adminEditListing`, before `prisma.variant.update`

**How**:
```typescript
const existing = await prisma.variant.findFirst({
  where: { gtin, id: { not: listing.variantId } },
});
if (existing) throw new Error(`Barcode "${gtin}" is already assigned to another variant`);
```

---

## 5. Set Price on Shopify Variant After Creation

**What**: When creating a new listing that creates a Shopify product, set the variant price (currently defaults to $0).

**Files changed**:
- `app/services/shopify/products.server.ts` — add `price` parameter to `ensureShopifyProductAndVariant`, call `productVariantUpdate` after creation
- `app/services/listings.server.ts` — pass `price` to `ensureShopifyProductAndVariant`
- `app/services/submission.server.ts` — pass `listing.price` in activate flow

**How**:
After product creation, add:
```graphql
mutation variantUpdate($input: ProductVariantInput!) {
  productVariantUpdate(input: $input) {
    productVariant { id }
    userErrors { field message }
  }
}
```
Variables: `{ input: { id: shopifyVariant.id, price: String(price) } }`

---

## 6. Updated Sync Script

**What**: `scripts/sync-shopify-ids.ts` updated to skip already-linked products, update titles/images from Shopify, handle unlinked products.

**How**: See the stashed version of `scripts/sync-shopify-ids.ts`.

---

## 7. Seed Scripts

**What**: New seed scripts for production deployment.
- `prisma/seed-from-sql.ts` — seeds listings from old app's MySQL dump
- Uses `pr.csv` (live active assignments) as primary data source
- Matches by Shopify product/variant ID, creates missing products
- Links shopifyProductId + shopifyVariantId

---

## Priority Order
1. GTIN uniqueness check (prevents crashes)
2. Set price on Shopify variant (critical for sales)
3. Split edit modal (UX improvement)
4. Barcode sync to Shopify (data integrity)
5. Shopify product update mutation (nice to have)
6. Sync script update (deployment)