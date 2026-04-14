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

---

## 8. Smart Size System (StockX-style)

**What**: Replace free-text size input with structured size types and constrained dropdowns.

**Size Types**:
- `us_mens` — 3.5, 4, 4.5 ... 18 (default for men's sneakers)
- `us_womens` — 5, 5.5, 6 ... 16 (women's shoes, "W" prefix)
- `us_youth` — 3.5Y, 4Y ... 7Y (grade school / GS)
- `us_kids` — 2C, 3C ... 13.5C (toddler / TD)
- `eu` — 36, 37, 38 ... 48 (European)
- `uk` — 3, 3.5 ... 14 (British)
- `apparel` — XXXS, XXS, XS, S, M, L, XL, XXL, XXXL, XXXXL
- `waist` — 28, 29, 30, 31, 32, 33, 34, 36, 38, 40, 42 (jeans/pants)
- `one_size` — O/S

**Auto-detection from category + title**:
- Sneakers → `us_mens` (default)
- Title contains "(Women's)" → `us_womens`
- Title contains "(GS)" → `us_youth`
- Title contains "(TD)" or "(PS)" → `us_kids`
- T-Shirts/Hoodies/Jackets/etc → `apparel`
- Jeans → `waist`
- Accessories/Headwear → `one_size`

**Schema**: Add `sizeType String?` to Product model (nullable, backwards compatible)

**New module**: `app/lib/sizes/` (constants.ts, detect.ts, format.ts, index.ts)
- Mirrors `app/lib/categories/` pattern
- `detectSizeType(category, title)` — auto-detect
- `formatSizeDisplay(size, sizeType)` — "10" → "US 10", "7" → "W 7"
- `SIZE_TYPES` record with labels, prefixes, valid size arrays

**UI Changes**:
- Size type dropdown auto-populated from category/title
- Size input becomes constrained dropdown of valid sizes for selected type
- "+ Custom size" escape hatch for edge cases
- Display: show type prefix on size chips where helpful

**Files**:
- NEW: `app/lib/sizes/constants.ts`, `detect.ts`, `format.ts`, `index.ts`
- `prisma/schema.prisma` — add `sizeType` to Product
- `app/lib/size-order.ts` — type-aware sorting
- `app/components/admin/CreateListingForm.tsx` — size type selector + dropdown
- `app/routes/portal.listings_.new.tsx` — portal equivalent
- `app/services/catalog.server.ts` — accept sizeType
- `app/lib/validation.ts` — add sizeType to schemas
- NEW: `scripts/backfill-size-types.ts` — backfill existing products

---

## Priority Order
1. GTIN uniqueness check (prevents crashes)
2. Set price on Shopify variant (critical for sales)
3. Split edit modal (UX improvement)
4. Barcode sync to Shopify (data integrity)
5. Shopify product update mutation (nice to have)
6. Sync script update (deployment)
7. Smart size system (future — StockX-style)