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

## Webhook Routes

| Route | Topic | Purpose |
|-------|-------|---------|
| `webhooks.orders.create.tsx` | orders/create | Process new order → create OrderItems + Transactions |
| `webhooks.orders.paid.tsx` | orders/paid | Mark order as paid |
| `webhooks.orders.cancelled.tsx` | orders/cancelled | Handle cancellation |
| `webhooks.refunds.create.tsx` | refunds/create | Process refund → restock |
| `webhooks.app.scopes_update.tsx` | app/scopes_update | Re-auth on permission change |
| `webhooks.app.uninstalled.tsx` | app/uninstalled | Cleanup on uninstall |

## Other Routes

| Route | Purpose |
|-------|---------|
| `auth.$.tsx` | Shopify OAuth catch-all |
| `auth.login/route.tsx` | Shopify OAuth login |
| `_index/route.tsx` | Root redirect |
| `api.products.create.ts` | Product creation REST endpoint |

---

## Components

### Admin (`app/components/admin/`)

| Component | Purpose |
|-----------|---------|
| `ListingsTable.tsx` | Grouped listings table — expand/collapse, inline edit, bulk actions, section picker |
| `CreateListingForm.tsx` | Full listing creation form — product search, category, size, price, image |
| `ListingsFilter.tsx` | Filter bar — search, status/category/consignor/section chip filters |
| `StatsCard.tsx` | Dashboard stat card — icon, value, trend, info tooltip |
| `ActionItem.tsx` | Action required item — glowing color line, count |
| `ActivityItem.tsx` | Activity feed item |
| `CustomSelect.tsx` | Dropdown select — searchable, chipStyle support |
| `DateRangeFilter.tsx` | Date picker — presets + DayPicker calendar |
| `Dropdown.tsx` | Portal-rendered dropdown container |
| `QuickAddPopover.tsx` | Quick-add listing popover from listings table |
| `Pagination.tsx` | Page navigation (shared) |

### Portal (`app/components/portal/`)

| Component | Purpose |
|-----------|---------|
| `AppHeader.tsx` | Portal header — title, avatar, notifications |
| `Sidebar.tsx` | Portal sidebar nav + mobile bottom tab bar |
| `GlassSelect.tsx` | Glass-themed select dropdown |
| `DateRangePicker.tsx` | Glass-themed date picker — presets + DayPicker, portal rendering |
| `InfoTip.tsx` | Info tooltip (hover/tap for explanation) |

---

## Services

### Core (`app/services/`)

| Service | Purpose |
|---------|---------|
| `catalog.server.ts` | findOrCreateProduct, findOrCreateVariant |
| `listings.server.ts` | createListing, cancelListing, bulkCancelListings, restoreListing |
| `submission.server.ts` | approveListing, rejectListing, activateListing, adminEditAndApprove, adminEditListing, requestWithdrawal, approveWithdrawal, completeWithdrawal |
| `inventory.server.ts` | syncInventory — sets price + qty on Shopify variant, manages inventory levels |
| `listing-queries.server.ts` | queryListings — filters, pagination, grouped mode |
| `orders.server.ts` | processOrder, refundOrder, getConsignorBalance, creditOrder |
| `order-queries.server.ts` | getOrderDetail |
| `consignors.server.ts` | createConsignor, updateConsignor, suspendConsignor, unsuspendConsignor, getConsignorDetail |
| `payouts.server.ts` | createPayout, markInvoiced, markPaid, cancelPayout, getPayoutsPageData |
| `dashboard.server.ts` | getDashboardData, getActivityFeed |
| `email.server.ts` | sendOtpEmail (Resend SDK) |
| `otp.server.ts` | generateOtp, verifyOtp |
| `webhooks.server.ts` | withWebhookDedup (idempotency) |

### Portal (`app/services/portal/`)

| Service | Purpose |
|---------|---------|
| `auth.server.ts` | authenticatePortal, createSessionCookie, createImpersonationToken, verifyImpersonationToken |
| `dashboard.server.ts` | getConsignorDashboard, getConsignorPayouts, getConsignorSales, getConsignorNotifications |
| `products.server.ts` | searchProducts, getMarketData |

### Shopify (`app/services/shopify/`)

| Service | Purpose |
|---------|---------|
| `products.server.ts` | ensureShopifyProductAndVariant, updateShopifyProduct, updateShopifyProductImage, backfillProductImages |
| `taxonomy.server.ts` | resolveShopifyTaxonomyId (search-based), searchShopifyTaxonomy |

---

## Lib / Utilities

### Admin (`app/lib/admin/`)

| File | Purpose |
|------|---------|
| `listing-ui.ts` | Shared inline styles: inputStyle, labelStyle, sectionCard, sectionHeader, sectionTitle, statusBadge, thStyle, tdStyle |

### Categories (`app/lib/categories/`)

| File | Purpose |
|------|---------|
| `constants.ts` | CATEGORIES (Footwear/Apparel/Accessories/Headwear with subcategories), MAIN_CATEGORIES |
| `auto-suggest.ts` | autoSuggest(title) — detects brand + category from product title (90+ keyword rules) |
| `helpers.ts` | buildCategory, parseCategory, isFootwear |
| `barcode.ts` | generateBarcode, abbreviateBrand, abbreviateSubcategory |
| `index.ts` | Re-exports all |

### Root (`app/lib/`)

| File | Purpose |
|------|---------|
| `tax.ts` | computeTax — GST/QST calculation per province (QC: GST+QST, others: GST only) |
| `csv.ts` | generateCsv, downloadCsv — client-side CSV generation |
| `pdf.ts` | downloadStatement — PDF payout statements with jsPDF + autoTable |
| `currency.ts` | fmt() — format number as $X,XXX.XX |
| `validation.ts` | Zod schemas: createConsignor, updateConsignor, submitListing, adminEditListing, verifyOtp, etc. |
| `rate-limit.server.ts` | In-memory sliding-window rate limiter (login: 10/15min, portal API: 60/min, forms: 20/min) |
| `size-order.ts` | compareSizes — intelligent size sorting (numeric, clothing letters, OS) |
| `image-processing.ts` | processProductImage — resize/compress for upload |

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
| `inventory.test.ts` | syncInventory, price sync, qty calculation |
| `listing-management.test.ts` | Cancel, restore, bulk operations |
| `listings.test.ts` | createListing end-to-end |
| `orders.test.ts` | processOrder, refund, balance calculation |
| `payouts.test.ts` | createPayout, markInvoiced, markPaid, cancel |
| `security.test.ts` | Auth, rate limiting, HMAC cookies, OTP |
| `shopify-products.test.ts` | ensureShopifyProductAndVariant, SKU generation, taxonomy |
| `shopify-taxonomy.test.ts` | resolveShopifyTaxonomyId, searchShopifyTaxonomy |
| `submission.test.ts` | approve, reject, activate, edit, withdrawal lifecycle |
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
