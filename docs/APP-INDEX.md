# App Index — Full File Reference

> **Keep this updated** whenever files are added, moved, or deleted.

---

## Core

| File | Purpose |
|------|---------|
| `app/root.tsx` | Root layout, loads Inter font |
| `app/routes.ts` | Route config — `flatRoutes()` (dot-notation) |
| `app/entry.server.tsx` | Server entry — security headers, CSP (dev vs prod) |
| `app/db.server.ts` | Prisma client singleton |
| `app/shopify.server.ts` | Shopify admin client config |
| `app/globals.d.ts` | TypeScript global declarations |
| `app/portal.css` | Portal dark glass theme (Tailwind + custom CSS) |
| `prisma/schema.prisma` | Database models: Session, Consignor, Product, Variant, Listing, Order, OrderItem, Transaction, Payout, PayoutItem, WebhookEvent, ReassignmentLog, OtpCode, StoreSection |

---

## Admin Routes (Shopify embedded)

| Route | URL | Purpose |
|-------|-----|---------|
| `app.tsx` | `/app` | Layout — nav sidebar |
| `app._index.tsx` | `/app` | Dashboard — stats cards, action items, activity feed |
| `app.inventory.tsx` | `/app/inventory` | Create listing form |
| `app.listings.tsx` | `/app/listings` | Listings management — filters, bulk actions, pagination |
| `app.orders.tsx` | `/app/orders` | Order list with filters, CSV download |
| `app.orders_.$id.tsx` | `/app/orders/:id` | Order detail — items, ledger, timeline, tax |
| `app.consignors.tsx` | `/app/consignors` | Consignor list + create modal |
| `app.consignors_.$id.tsx` | `/app/consignors/:id` | Consignor detail — edit, suspend, tax fields, View Portal |
| `app.payouts.tsx` | `/app/payouts` | Payout management — unpaid, pending, history, CSV download |
| `app.sections.tsx` | `/app/sections` | Store section management (add/rename/delete) |
| `app.activity.tsx` | `/app/activity` | Full activity feed |
| `app.api.brands.tsx` | `/app/api/brands` | Brand search API |
| `app.api.products.tsx` | `/app/api/products` | Product search API |
| `app.api.taxonomy.tsx` | `/app/api/taxonomy` | Shopify taxonomy search API |
| `app.api.impersonate.tsx` | `/app/api/impersonate` | Generate impersonation token for portal |
| `app.api.invoice.$id.tsx` | `/app/api/invoice/:id` | Download consignor-uploaded invoice PDF |
| `app.cleanup.tsx` | `/app/cleanup` | Database cleanup utilities |
| `app.feedback.tsx` | `/app/feedback` | Admin feedback form |

## Portal Routes (Consignor-facing, standalone)

| Route | URL | Purpose |
|-------|-----|---------|
| `portal.tsx` | `/portal` | Layout — sidebar + auth guard |
| `portal.dashboard.tsx` | `/portal/dashboard` | Consignor dashboard — stats, performance chart |
| `portal.listings.tsx` | `/portal/listings` | Consignor's listings — pagination (desktop), infinite scroll (mobile), mobile detail drawer |
| `portal.listings_.new.tsx` | `/portal/listings/new` | Submit new listing |
| `portal.listings_.$id.edit.tsx` | `/portal/listings/:id/edit` | Edit listing |
| `portal.payouts.tsx` | `/portal/payouts` | Payouts — date filter, PDF download, tax breakdown |
| `portal.sales.tsx` | `/portal/sales` | Sales history — date filter, PDF download |
| `portal.profile.tsx` | `/portal/profile` | Edit profile, tax status, notification prefs |
| `portal._index.tsx` | `/portal` | Redirect to dashboard |
| `portal_.login.tsx` | `/portal/login` | OTP email login |
| `portal_.logout.tsx` | `/portal/logout` | Logout |
| `portal_.impersonate.tsx` | `/portal/impersonate` | Accept impersonation token → set cookie |
| `portal.api.brands.tsx` | `/portal/api/brands` | Brand search (portal) |
| `portal.api.products.tsx` | `/portal/api/products` | Product search (portal) |
| `portal.api.market-data.tsx` | `/portal/api/market-data` | Market data (lowest prices) |
| `portal.api.notifications-read.tsx` | `/portal/api/notifications-read` | Mark notifications read |
| `portal.feedback.tsx` | `/portal/feedback` | Portal feedback form |

## Webhook Routes

| Route | Topic | Purpose |
|-------|-------|---------|
| `webhooks.orders.create.tsx` | orders/create | Process new order → create OrderItems + Transactions |
| `webhooks.orders.paid.tsx` | orders/paid | Mark order as paid |
| `webhooks.orders.cancelled.tsx` | orders/cancelled | Handle cancellation |
| `webhooks.refunds.create.tsx` | refunds/create | Process refund → restock |
| `webhooks.orders.fulfilled.tsx` | orders/fulfilled | Mark order fulfilled, trigger consignor "sold" visibility |
| `webhooks.app.scopes_update.tsx` | app/scopes_update | Re-auth on permission change |
| `webhooks.app.uninstalled.tsx` | app/uninstalled | Cleanup on uninstall |

## Other Routes

| Route | Purpose |
|-------|---------|
| `auth.$.tsx` | Shopify OAuth catch-all |
| `auth.login/route.tsx` | Shopify OAuth login |
| `_index/route.tsx` | Root redirect |
| `health.tsx` | Health check endpoint (`/health`) |
| `api.products.create.ts` | Product creation REST endpoint |

---

## Components

### Admin (`app/components/admin/`)

#### Shared (`app/components/admin/shared/`)

| Component | Purpose |
|-----------|---------|
| `StatsCard.tsx` | Dashboard stat card — icon, value, trend, info tooltip |
| `ActionItem.tsx` | Action required item — glowing color line, count |
| `ActivityItem.tsx` | Activity feed item |
| `CustomSelect.tsx` | Dropdown select — searchable, chipStyle support |
| `DateRangeFilter.tsx` | Date picker — presets + DayPicker calendar |
| `Dropdown.tsx` | Portal-rendered dropdown container |

#### Top-level admin components (`app/components/admin/`)

| Component | Purpose |
|-----------|---------|
| `ListingsFilter.tsx` | Filter bar — search, status/category/consignor/section chip filters |
| `QuickAddPopover.tsx` | Quick-add listing popover from listings table |
| `BulkActionBar.tsx` | Floating bulk-action toolbar — approve, activate, cancel selected listings |
| `DateRangeFilter.tsx` | Date picker (top-level alias) |

#### Listings (`app/components/admin/listings/`)

Refactored from the monolithic `ListingsTable.tsx` into focused sub-components.

| File | Purpose |
|------|---------|
| `types.ts` | Shared TypeScript types — Listing, ProductGroup, VariantInfo, SortKey, Props, EditApproveFields, EditProductFields |
| `listing-styles.ts` | Shared inline styles — inputStyle, sectionCard, thStyle, tdStyle, badges |
| `listing-ui.ts` | UI helpers — status labels, relative time, statusBadge colors |
| `listing-utils.tsx` | Utility functions — sorting, formatting, grouping logic |
| `ListingActionsContext.tsx` | React Context for listing actions — eliminates prop drilling for approve/reject/edit/cancel |
| `SectionPicker.tsx` | Portal-rendered store-section dropdown with search |
| `ListingsTable.tsx` | Main listings table — orchestrates views, modals, bulk selection |
| `GroupedView.tsx` | Grouped-by-product view mode for listings table |
| `FlatView.tsx` | Flat (ungrouped) view mode for listings table |
| `GroupRows.tsx` | Expandable product group rows — orchestrates desktop/mobile variants |
| `GroupRowsDesktop.tsx` | Desktop variant of group rows — full table layout |
| `GroupRowsMobile.tsx` | Mobile variant of group rows — compact card layout |
| `ListingsFilter.tsx` | Listings-specific filter bar |
| `BulkActionBar.tsx` | Bulk action toolbar (listings-specific) |
| `QuickAddPopover.tsx` | Quick-add popover (listings-specific) |
| `RejectModal.tsx` | Rejection reason modal |
| `EditListingModal.tsx` | Edit listing fields modal — price, cost, section, status |
| `EditProductModal.tsx` | Edit product fields modal — title, brand, category, image |
| `Pagination.tsx` | Page navigation |
| `useListingToasts.ts` | Toast notifications for listing action fetcher results |
| `index.ts` | Barrel export — default ListingsTable + type re-exports |

#### Create Listing (`app/components/admin/create-listing/`)

Refactored from the monolithic `CreateListingForm.tsx` into focused sub-components.

| File | Purpose |
|------|---------|
| `types.ts` | Shared TypeScript types — Consignor, FormFields, ProductResult |
| `helpers.ts` | Section card styles, field label helper, form utility functions |
| `SectionHeader.tsx` | Reusable section header with icon and title |
| `ProductSearch.tsx` | Typeahead product search with result list |
| `CategoryPicker.tsx` | Main category + subcategory + taxonomy search pickers |
| `ImageUpload.tsx` | Drag-and-drop / click image upload with preview |
| `VariantFields.tsx` | Size, condition, GTIN, barcode fields |
| `CreateListingForm.tsx` | Main form — orchestrates all sub-components, handles submit |
| `index.ts` | Barrel export — default CreateListingForm |

#### Consignors (`app/components/admin/consignors/`)

| File | Purpose |
|------|---------|
| `ConsignorsListPage.tsx` | Consignor list — name, email, fee rate, balance |
| `ConsignorDetailPage.tsx` | Consignor detail — orchestrates form, listings summary, suspend |
| `ConsignorForm.tsx` | Consignor edit form — name, email, phone, fee rate, tax fields |
| `ConsignorListingsSummary.tsx` | Consignor's listing status counts and recent listings |

#### Orders (`app/components/admin/orders/`)

| File | Purpose |
|------|---------|
| `OrdersListPage.tsx` | Order list with filters, CSV download |
| `OrderDetailPage.tsx` | Order detail — orchestrates items, ledger, timeline sections |
| `OrderItems.tsx` | Order line items table — allocated listings, consignor, price |
| `OrderLedger.tsx` | Financial ledger — transactions, fees, tax breakdown, cost/profit for store-owned |
| `OrderTimeline.tsx` | Order event timeline — status changes, fulfillment, refunds |

#### Sections (`app/components/admin/sections/`)

| File | Purpose |
|------|---------|
| `SectionsPage.tsx` | Store section management (add/rename/delete) |

#### Payouts (`app/components/admin/payouts/`)

Refactored payout page sections into standalone components.

| File | Purpose |
|------|---------|
| `payoutHelpers.tsx` | Shared types (UnpaidEntry, PayoutRef), StatCard component, CSV download helpers |
| `UnpaidSection.tsx` | Unpaid consignors section — expandable rows, create payout action, CSV download |
| `PendingSection.tsx` | Pending payouts section — mark invoiced/paid actions, CSV download |
| `HistorySection.tsx` | Completed payouts history section — expandable rows, CSV download |

### Portal (`app/components/portal/`)

#### Shared (`app/components/portal/shared/`)

| Component | Purpose |
|-----------|---------|
| `AppHeader.tsx` | Portal header — title, avatar, notifications |
| `Sidebar.tsx` | Portal sidebar nav + mobile bottom tab bar |
| `GlassSelect.tsx` | Glass-themed select dropdown |
| `DateRangePicker.tsx` | Glass-themed date picker — presets + DayPicker, portal rendering |
| `InfoTip.tsx` | Info tooltip (hover/tap for explanation) |

#### Top-level portal components (`app/components/portal/`)

| Component | Purpose |
|-----------|---------|
| `AppHeader.tsx` | Portal header (top-level alias) |
| `Sidebar.tsx` | Sidebar nav (top-level alias) |
| `GlassSelect.tsx` | Glass select (top-level alias) |
| `DateRangePicker.tsx` | Date picker (top-level alias) |
| `InfoTip.tsx` | Info tooltip (top-level alias) |

#### Auth (`app/components/portal/auth/`)

| File | Purpose |
|------|---------|
| `LoginPage.tsx` | OTP email login page component |

#### Dashboard (`app/components/portal/dashboard/`)

| File | Purpose |
|------|---------|
| `DashboardPage.tsx` | Consignor dashboard — stats, chart, notifications |

#### Listings (`app/components/portal/listings/`)

Refactored portal listings page into focused sub-components.

| File | Purpose |
|------|---------|
| `listingHelpers.ts` | Status constants (labels, colors, tabs), groupByProduct utility, ListingRow/ProductGroup types |
| `StatusBadge.tsx` | Colored pill badge for listing status |
| `InlinePrice.tsx` | Inline-editable price field with fetcher submit |
| `ListingGroup.tsx` | Desktop product group — expandable variant rows, action buttons, product images, sort by size |
| `MobileDetailDrawer.tsx` | Full-screen mobile drawer for listing details and actions |
| `ConfirmModal.tsx` | Reusable confirmation dialog (cancel, withdraw, delete) |
| `StatusTabs.tsx` | Active/Inactive/All status filter tab bar |
| `useInfiniteScroll.ts` | Infinite scroll hook — fetches next page on scroll, merges results |
| `index.ts` | Barrel export — StatusBadge, InlinePrice, ListingGroup, MobileDetailDrawer, ConfirmModal |

#### New Listing (`app/components/portal/listings/new/`)

Refactored from monolithic `NewListingPage` into focused sub-components.

| File | Purpose |
|------|---------|
| `NewListingPage.tsx` | New listing page — orchestrates product search and form |
| `ProductSearchGrid.tsx` | Product search grid — typeahead search with product cards |
| `ProductForm.tsx` | Listing submission form — size, price, condition, image |

#### Payouts (`app/components/portal/payouts/`)

Refactored from monolithic `PayoutsPage` into focused sub-components.

| File | Purpose |
|------|---------|
| `PayoutsPage.tsx` | Portal payouts page — orchestrates summary and sections |
| `PayoutsSummary.tsx` | Payout summary stats — total earned, pending, paid |
| `UnbatchedSection.tsx` | Unbatched sold items awaiting payout |
| `ActivePayouts.tsx` | Active/pending payouts section |
| `PaidHistory.tsx` | Completed payout history section |

#### Profile (`app/components/portal/profile/`)

Refactored from monolithic `ProfilePage` into focused sub-components.

| File | Purpose |
|------|---------|
| `ProfilePage.tsx` | Profile page — orchestrates account info and tax settings |
| `AccountInfo.tsx` | Account info section — name, email, phone, avatar |
| `TaxSettings.tsx` | Tax settings section — business type, tax numbers, province |

#### Sales (`app/components/portal/sales/`)

| File | Purpose |
|------|---------|
| `SalesPage.tsx` | Sales history — date filter, PDF download |

---

## Services

All services are organized into domain folders with barrel exports (`index.ts`). Import from the folder, not individual files.

### Catalog (`app/services/catalog/`)

| Service | Purpose |
|---------|---------|
| `catalog.server.ts` | findOrCreateProduct, findOrCreateVariant |
| `index.ts` | Barrel export |

### Listings (`app/services/listings/`)

| Service | Purpose |
|---------|---------|
| `mutations.server.ts` | createListing, cancelListing, bulkCancelListings, restoreListing |
| `queries.server.ts` | queryListings — filters, pagination, grouped mode |
| `index.ts` | Barrel export |

### Orders (`app/services/orders/`)

| Service | Purpose |
|---------|---------|
| `processing.server.ts` | processOrder, creditOrder — allocation and sale transactions |
| `refunds.server.ts` | refundOrder, cancelOrder — refund/cancel with restock |
| `queries.server.ts` | getOrderDetail |
| `balance.server.ts` | getConsignorBalance |
| `index.ts` | Barrel export |

### Consignors (`app/services/consignors/`)

| Service | Purpose |
|---------|---------|
| `consignors.server.ts` | createConsignor, updateConsignor, suspendConsignor, unsuspendConsignor, getConsignorDetail |
| `index.ts` | Barrel export |

### Inventory (`app/services/inventory/`)

| Service | Purpose |
|---------|---------|
| `inventory.server.ts` | syncInventory, safeSyncInventory — sets price + qty on Shopify variant, manages inventory levels |
| `index.ts` | Barrel export |

### Email (`app/services/email/`)

| Service | Purpose |
|---------|---------|
| `email.server.ts` | 8 email templates — OTP, item sold, payout ready, payout paid, withdrawal approved, submission confirmed, rejected, suspended |
| `index.ts` | Barrel export |

### OTP (`app/services/otp/`)

| Service | Purpose |
|---------|---------|
| `otp.server.ts` | generateOtp, verifyOtp, cleanExpiredOtps |
| `index.ts` | Barrel export |

### Webhooks (`app/services/webhooks/`)

| Service | Purpose |
|---------|---------|
| `webhooks.server.ts` | withWebhookDedup (idempotency via WebhookEvent model) |
| `index.ts` | Barrel export |

### Submission (`app/services/submission/`)

Listing submission lifecycle — focused sub-modules.

| Service | Purpose |
|---------|---------|
| `consignor-actions.server.ts` | submitListing, updateSubmittedListing, deleteSubmittedListing — consignor-facing submission actions |
| `approval.server.ts` | approveListing, rejectListing — admin approval/rejection |
| `edit.server.ts` | adminEditAndApprove, adminEditListing, adminEditProduct — admin inline editing |
| `lifecycle.server.ts` | activateListing, requestWithdrawal, approveWithdrawal, denyWithdrawal, completeWithdrawal — listing lifecycle transitions |
| `bulk.server.ts` | bulkApproveListing, bulkActivateListing — bulk admin actions |
| `index.ts` | Barrel export |

### Admin (`app/services/admin/`)

| Service | Purpose |
|---------|---------|
| `listing-actions.server.ts` | Route-level action handler — dispatches listing form intents (approve, reject, edit, cancel, restore, bulk ops, retry sync) |
| `dashboard.server.ts` | getDashboardData, getActivityFeed — admin dashboard stats |
| `payouts.server.ts` | getPayoutsPageData, createPayout, markInvoiced, markPaid, cancelPayout |
| `index.ts` | Barrel export |

### Portal (`app/services/portal/`)

| Service | Purpose |
|---------|---------|
| `auth.server.ts` | authenticatePortal, createSessionCookie, createImpersonationToken, verifyImpersonationToken |
| `dashboard.server.ts` | getConsignorDashboard — stats, chart, notifications, financial stats toggle |
| `notifications.server.ts` | buildNotifications, getConsignorNotifications — portal notification feed |
| `sales.server.ts` | getConsignorSales — sales history with filters and date range |
| `payouts.server.ts` | getConsignorPayouts — payout history for portal view |
| `products.server.ts` | searchProducts, getMarketData — word-based search with relevance ranking |
| `index.ts` | Barrel export |

### Shopify (`app/services/shopify/`)

| Service | Purpose |
|---------|---------|
| `products.server.ts` | ensureShopifyProductAndVariant, updateShopifyProduct, updateShopifyProductImage, backfillProductImages |
| `shopify-create.server.ts` | Shopify product creation sub-functions |
| `shopify-helpers.server.ts` | Shopify helper utilities |
| `taxonomy.server.ts` | resolveShopifyTaxonomyId (search-based), searchShopifyTaxonomy |
| `index.ts` | Barrel export |

---

## Lib / Utilities

### Domain (`app/lib/domain/`)

Status constants and business domain enums.

| File | Purpose |
|------|---------|
| `listing-statuses.ts` | LISTING_STATUS constants, TERMINAL_STATUSES, ACTIVE_STATUSES, status groups |
| `order-statuses.ts` | ORDER_STATUS constants (open, refunded, cancelled, fulfilled) |
| `payout-statuses.ts` | PAYOUT_STATUS constants (pending, invoiced, paid), TRANSACTION_TYPE, CONSIGNOR_STATUS |
| `index.ts` | Barrel export |

### Finance (`app/lib/finance/`)

Financial calculation utilities.

| File | Purpose |
|------|---------|
| `fee-calc.ts` | calculateFee — canonical fee/commission/consignor-amount calculation |
| `tax.ts` | computeTax — GST/QST calculation per province (QC: GST+QST, others: GST only) |
| `index.ts` | Barrel export |

### Formatting (`app/lib/formatting/`)

Display and export utilities.

| File | Purpose |
|------|---------|
| `csv.ts` | generateCsv, downloadCsv — client-side CSV generation |
| `currency.ts` | fmt() — format number as $X,XXX.XX |
| `pdf.ts` | downloadStatement — PDF payout statements with jsPDF + autoTable |
| `index.ts` | Barrel export |

### System (`app/lib/system/`)

Infrastructure and cross-cutting concerns.

| File | Purpose |
|------|---------|
| `env.server.ts` | Environment variable access and validation |
| `logger.server.ts` | Structured JSON logger (info, error, warn) |
| `rate-limit.server.ts` | In-memory sliding-window rate limiter (login: 10/15min, portal API: 60/min, forms: 20/min) |
| `sentry.server.ts` | Sentry error tracking integration |
| `index.ts` | Barrel export |

### Categories (`app/lib/categories/`)

| File | Purpose |
|------|---------|
| `constants.ts` | CATEGORIES (Footwear/Apparel/Accessories/Headwear with subcategories), MAIN_CATEGORIES |
| `auto-suggest.ts` | autoSuggest(title) — detects brand + category from product title (90+ keyword rules) |
| `helpers.ts` | buildCategory, parseCategory, isFootwear |
| `barcode.ts` | generateBarcode, abbreviateBrand, abbreviateSubcategory |
| `index.ts` | Re-exports all |

### Root (`app/lib/`)

Legacy files (many re-exported via domain folders above).

| File | Purpose |
|------|---------|
| `tax.ts` | computeTax (legacy location — canonical is `finance/tax.ts`) |
| `csv.ts` | generateCsv (legacy location — canonical is `formatting/csv.ts`) |
| `pdf.ts` | downloadStatement (legacy location — canonical is `formatting/pdf.ts`) |
| `currency.ts` | fmt() (legacy location — canonical is `formatting/currency.ts`) |
| `fee-calc.ts` | calculateFee (legacy location — canonical is `finance/fee-calc.ts`) |
| `listing-statuses.ts` | LISTING_STATUS (legacy location — canonical is `domain/listing-statuses.ts`) |
| `order-statuses.ts` | ORDER_STATUS (legacy location — canonical is `domain/order-statuses.ts`) |
| `payout-statuses.ts` | PAYOUT_STATUS (legacy location — canonical is `domain/payout-statuses.ts`) |
| `validation.ts` | Zod schemas: createConsignor, updateConsignor, submitListing, adminEditListing, verifyOtp, etc. |
| `rate-limit.server.ts` | Rate limiter (legacy location — canonical is `system/rate-limit.server.ts`) |
| `logger.server.ts` | Logger (legacy location — canonical is `system/logger.server.ts`) |
| `env.server.ts` | Env (legacy location — canonical is `system/env.server.ts`) |
| `sentry.server.ts` | Sentry (legacy location — canonical is `system/sentry.server.ts`) |
| `size-order.ts` | compareSizes — intelligent size sorting (numeric, clothing letters, OS) |
| `image-processing.ts` | processProductImage — resize/compress for upload |
| `deriveProductMetafields.ts` | Derive age_group + target_gender from category/title |

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/sync-shopify-ids.ts` | Match local products to Shopify by title → store shopifyProductId + shopifyVariantId |
| `scripts/backfill-order-numbers.ts` | Fetch order names from Shopify API |
| `scripts/fix-inventory.ts` | Fix inventory levels |
| `scripts/sort-shopify-sizes.ts` | Reorder Shopify variant positions by size |
| `scripts/reset-dev-store.ts` | Reset dev store data |
| `scripts/rebuild-shopify-state.ts` | Rebuild Shopify product state |
| `scripts/verify-shop-consignors.ts` | Verify consignor data |

## Seed Scripts (`prisma/`)

| Script | Purpose |
|--------|---------|
| `seed-shopify.ts` | Seed from Shopify CSV export (products + variants + consignors) |
| `seed-from-sql.ts` | Seed listings from old MySQL dump (pr.csv) — matches by Shopify product/variant ID |
| `seed-import.ts` | Seed from db-export.json (legacy) |
| `seed-stress.ts` | Generate test data for stress testing |
| `seed.ts` | Default Prisma seed |
| `reset-all.ts` | Reset all marketplace data |
| `reset-sessions.ts` | Clear Shopify sessions |
| `reset-shopify-ids.ts` | Clear shopifyProductId/shopifyVariantId |

---

## Tests (`tests/`)

| Test | Covers |
|------|--------|
| `catalog.test.ts` | findOrCreateProduct, findOrCreateVariant |
| `categories.test.ts` | autoSuggest, buildCategory, parseCategory, isFootwear, abbreviations, barcode |
| `consignors.test.ts` | CRUD, suspension, tax fields |
| `dashboard.test.ts` | getDashboardData, getActivityFeed |
| `fee-calc.test.ts` | calculateFee edge cases, rounding |
| `inventory.test.ts` | syncInventory, price sync, qty calculation |
| `listing-management.test.ts` | Cancel, restore, bulk operations |
| `listings.test.ts` | createListing end-to-end |
| `metafields.test.ts` | deriveProductMetafields (age_group, target_gender) |
| `orders.test.ts` | processOrder, refund, balance calculation |
| `payout-statuses.test.ts` | PAYOUT_STATUS, TRANSACTION_TYPE, CONSIGNOR_STATUS constants |
| `payouts.test.ts` | createPayout, markInvoiced, markPaid, cancel |
| `security.test.ts` | Auth, rate limiting, HMAC cookies, OTP |
| `session-timeout.test.ts` | Cookie idle/absolute timeout, sliding window |
| `shopify-products.test.ts` | ensureShopifyProductAndVariant, SKU generation, taxonomy |
| `shopify-taxonomy.test.ts` | resolveShopifyTaxonomyId, searchShopifyTaxonomy |
| `submission.test.ts` | approve, reject, activate, edit, withdrawal lifecycle |
| `tax.test.ts` | computeTax per-province calculations |
| `webhooks.test.ts` | Webhook dedup, order processing |
| `setup.ts` | Test setup — clean DB before each test |
| `helpers/mock-admin.ts` | Mock Shopify admin client for tests |

---

## Docs (`docs/`)

| Doc | Purpose |
|-----|---------|
| `TODO-STASHED-CHANGES.md` | Planned features with implementation details (edit split, barcode sync, size system) |
| `PRODUCTION-CHECKLIST.md` | Deployment checklist (env vars, security, rate limits) |
| `FEATURES.md` | Full feature roadmap |
| `APP-INDEX.md` | This file |

---

## Config Files

| File | Purpose |
|------|---------|
| `shopify.app.toml` | Shopify app config (store, scopes, webhooks) |
| `vite.config.ts` | Vite + React Router config |
| `vitest.config.ts` | Test config (separate test.sqlite DB) |
| `tsconfig.json` | TypeScript config with `~/` path alias |
| `tailwind.config.ts` | Tailwind config (portal theme) |
| `.env` | Environment variables (DATABASE_URL, COOKIE_SECRET, RESEND_API_KEY) |

---

*Last updated: April 2026*
