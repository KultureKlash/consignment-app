# Stashed Changes — To Implement Later

These changes were developed but reverted for stability. Re-implement cleanly.

**COMPLETED (now in codebase):**
- ~~Split Edit Modal (Product vs Listing)~~ — Done: `EditProductModal.tsx` + `EditListingModal.tsx` in `admin/listings/`
- ~~Shopify Product Update Mutation~~ — Done: `updateShopifyProduct()` in `services/shopify/products.server.ts`
- ~~Barcode Sync to Shopify on Edit~~ — Done: in `services/submission/edit.server.ts`
- ~~GTIN Uniqueness Check~~ — Done: in `services/submission/edit.server.ts` and `approval.server.ts`
- ~~Set Price on Shopify Variant After Creation~~ — Done: inventory sync handles pricing
- ~~Updated Sync Script~~ — Done: `scripts/sync-shopify-ids.ts`
- ~~Seed Scripts~~ — Done: `prisma/seed-from-sql.ts`

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

## Remaining Priority
1. Smart size system (future — StockX-style)