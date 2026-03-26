# Marketplace Feature Roadmap

This document tracks all features required for the consignment marketplace platform.

Features are grouped by development phase.

Status legend:

[ ] Not started
[~] In progress
[x] Completed

---

# Phase 1 — Core Platform Engine

These features form the foundation of the marketplace.

## Infrastructure

[x] Remix Shopify app setup
[x] PostgreSQL / SQLite database
[x] Prisma ORM configuration
[x] Environment configuration
[x] Shopify OAuth authentication (handled by Shopify template)

---

## Marketplace Roles

The system supports three user roles:

**Admin (Shopify Store Owner)**
Logs in through Shopify Admin and manages the marketplace through the embedded Shopify app.

**Consignors / Resellers**
Log into the consignor portal via password authentication.

**Customers**
Purchase products through the Shopify storefront.

---

## Product Catalog

[ ] StockX API integration
[ ] Product import by Style ID
[x] Store product catalog locally (Product + Variant models)
[x] Product image upload (manual, synced to Shopify via staged uploads)
[x] Image processing (resize, center, white-square padding, PNG lossless)
[x] Product image thumbnails in listings table
[x] Backfill product images from Shopify for existing products
[x] Variant creation (sizes)
[x] GTIN barcode storage per variant
[x] Product category and subcategory support
[x] Optional styleId (products can exist without one)
[x] Searchable product finder with debounced search
[x] Brand autocomplete from existing catalog

---

## Catalog Integrity

[x] Enforce unique `styleId` for products (when provided)
[x] Prevent duplicate product creation
[x] Validate size variants per product (unique productId + size)
[x] Unique GTIN constraint per variant
[ ] Normalize brand and product naming

---

## Consignor Accounts

[x] Consignor database model with configurable fee rate
[x] Fee rate model (e.g. 15% fee = marketplace keeps 15%, consignor gets 85%)
[x] Default fee rate: 15%
[x] Consignor balance tracking (sum transactions minus payouts)
[x] Consignor login system (password-based dev auth via portal-auth.server.ts)
[x] Consignor authentication (cookie-based session)
[x] Consignor profile management (name, email, phone, tax status, province, GST/QST, avatar color)
[x] Consignor dashboard (stats, earnings chart, recent sales, listing breakdown, notifications)
[x] Store-owned consignor flag (storeOwned — separate profit tracking, no payouts)
[x] Individual vs business tax status (affects payout invoice flow)

---

## Listing Engine

[x] Per-item listing model (each DB row = 1 physical item, no quantity field)
[x] Listing creation (count parameter creates N individual listings)
[x] Listing price input
[x] Listing cancellation with inventory re-sync
[x] Bulk listing cancellation with batched DB updates and per-variant Shopify sync with retry
[x] Lifecycle timestamps (createdAt, submittedAt, approvedAt, rejectedAt, receivedAt, authenticatedAt, listedAt, soldAt, withdrawnAt, withdrawalApprovedAt)
[x] Listing statuses: submitted, approved_awaiting_dropoff, active, paused, pending_sale, sold, cancelled, rejected, withdrawal_requested, pending_pickup, withdrawn
[x] Composite index on [variantId, status, price, createdAt] for allocation queries
[x] Composite index on [consignorId, status, createdAt] for filtering

---

## Shopify Product Sync

[x] Create Shopify product from catalog
[x] Create Shopify variants (sizes)
[x] Store Shopify `productId` in database
[x] Store Shopify `variantId` in database
[x] Sync lowest listing price to Shopify
[x] SKU sync to Shopify (footwear: styleId, non-footwear: barcode/GTIN)
[x] Shopify taxonomy resolution for product categorization
[x] Resilient sync (listing created even if Shopify call fails)

---

## Inventory Synchronization

[x] Count active listings per variant at lowest price tier
[x] Sync total inventory to Shopify variant
[x] Trigger inventory sync when listing is created
[x] Trigger inventory sync when listing is cancelled
[x] Trigger inventory sync after order allocation
[x] Delete Shopify variant when inventory reaches zero (unless last variant)

---

# Phase 2 — Marketplace Logic

These features enable multi-seller marketplace functionality.

---

## Listing Selection

[x] Lowest price allocation
[x] FIFO tiebreak (oldest createdAt first)
[x] Per-item allocation (1 OrderItem = 1 Listing)

---

## Order Processing

[x] Shopify `orders/create` webhook
[x] Shopify `orders/cancelled` webhook
[x] Shopify `refunds/create` webhook
[x] Variant detection from order
[x] Per-item listing allocation (price ASC, createdAt ASC)
[x] Listing marked pending_sale then sold (with soldAt timestamp)
[x] Per-item OrderItem (1 OrderItem = 1 listing)
[x] Prevent oversell with database transactions
[x] Idempotent order processing (webhook dedup via WebhookEvent model)
[x] Payment status tracking (pending / paid)

---

## Refund & Cancellation

[x] Full order cancellation (cancelOrder)
[x] Full refund (refundOrder)
[x] Partial refund support (per-item OrderItem selection)
[x] Reverse-allocation refund priority (price DESC, createdAt DESC)
[x] Void vs refund distinction (payment captured or not)
[x] Restock handling (return / cancel / no_restock)
[x] Inventory re-sync after refund
[x] Idempotent refund processing
[x] Post-payout refund handling (reassign to shop consignor instead of negative transaction)
[x] Shop consignors: Kulture Klash (footwear) and Kulture Klothing (non-footwear) with 100% fee rate
[x] ReassignmentLog audit trail for post-payout refund reassignments

---

## Financial Ledger

[x] Transaction model (sale / refund types)
[x] Sale entry creation per allocated item
[x] Fee calculation (grossAmount × feeRate)
[x] Consignor amount calculation (grossAmount × (1 - feeRate))
[x] Fee rate snapshot (immutable at transaction creation time)
[x] Audit-grade fields: salePrice, feeRate, grossAmount, feeAmount, consignorAmount, amount
[x] Consignor balance tracking (sum transactions minus completed payouts)

---

## Payout System

[x] Payout database model
[x] PayoutItem join table (Payout ↔ Transaction, per-item tracking)
[x] Balance calculation respects completed payouts
[x] Create payout from selected transactions (validates ownership, prevents double-payout)
[x] Mark payout as invoiced (business consignors)
[x] Mark payout as paid (business: requires invoiced first; individual: can skip invoice)
[x] Cancel pending payout (cascade-deletes items, frees transactions)
[x] Payout page data loader (unpaid grouped by consignor, history, stats)
[x] Consignor invoice sent flow (consignor self-reports via portal)

---

# Phase 3 — Admin Panel

Admin manages the marketplace from **inside Shopify Admin** via embedded app.

---

## Admin Navigation

[x] Home (dashboard)
[x] Create Listing page
[x] Listings page (all listings)
[x] Orders page
[x] Consignors page
[x] Payouts page
[x] Activity feed page (full history)

---

## Admin Dashboard (Home)

[x] Stats cards: Total Revenue, Consignment Fees, Store Profit, Total Earnings, Total Orders, Inventory Value
[x] Recent activity feed (5 items, expandable to 15)
[x] Quick action items (awaiting approval, awaiting drop-off, withdrawal requests)
[x] Last updated timestamp
[x] Staggered entry animations

---

## Create Listing Page

[x] Consignor selector with search and autocomplete
[x] Product finder with debounced search
[x] New product creation (title, brand, category, size, GTIN)
[x] Brand autocomplete from existing catalog
[x] Category and subcategory selection
[x] GTIN/barcode input per variant (auto-generated for non-footwear)
[x] Style ID optional (products matched by title+brand when no styleId)
[x] Footwear size validation (1-99, .5 increments only)
[x] Auto-fill O/S size for Accessories and Headwear categories
[x] Price input with validation
[x] Cost input for store-owned consignors
[x] Quantity selector (creates N individual listings)
[x] 10 most recent listings table (flat view)
[x] "View all" link to full listings page

---

## Listings Page

[x] Server-side search (product title, styleId, brand, consignor name/email)
[x] Status filter (All, Active, Pending, Sold, Cancelled, Submitted, etc.)
[x] Category filter with subcategory drill-down
[x] Consignor filter
[x] Sortable columns (date, price, status)
[x] Server-side pagination (25 per page)
[x] Grouped-by-product view (collapsible product rows, StockX-style)
[x] Status summary on collapsed rows (e.g. "3 active, 1 sold")
[x] Loading state during navigation
[x] Cancel listing action
[x] Clear filters
[x] Size-ordered child rows within product groups (numeric + clothing sizes)
[x] Quick-add popover on product groups (add listings to existing products inline)
[x] Bulk cancel with reliable Shopify sync (batched DB, per-variant retry)
[x] Listing moderation: approve, reject (with reason), bulk approve, bulk activate
[x] Edit & Approve modal for submitted listings
[x] Admin edit modal for any non-terminal listing (title, brand, price, cost, GTIN, size)
[x] Shopify re-sync on edit for active/pending_sale listings

---

## Orders Page

[x] Order list (basic view)
[x] Order detail page (items, allocated listings, consignor, payment status, timeline)

---

## Consignors Page

[x] Consignor list with name, email, fee rate, balance
[x] Balance calculation per consignor
[x] Clickable rows → navigate to consignor detail page
[x] Consignor detail page (view/edit name, email, fee rate, store-owned flag)
[x] Copy consignor ID to clipboard
[x] Listing status counts (active, pending sale, sold, cancelled)
[x] Link to payouts tab from consignor detail
[x] Fee rate configuration per consignor

---

## Payouts Page

[x] Unpaid balances grouped by consignor with expandable transaction list
[x] Transaction selection (checkbox per item, select all)
[x] Create payout from selected transactions
[x] Pending payouts section with status badges
[x] Mark invoiced (business) / Mark paid (individual or invoiced)
[x] Cancel payout
[x] Payout history (paid)
[x] Consignor filter and date range filter
[x] Stats: Outstanding, Awaiting Invoice, Invoice Received, Paid Out

---

## Admin Tools (remaining)

[~] Marketplace overview dashboard (has stats, missing trend charts)
[x] Product catalog management (edit/merge existing products)
[x] Consignor account freeze / suspension
[ ] Ledger inspection view (browse all transactions)

---

# Phase 4 — Consignor Portal

Consignor-facing portal for managing listings, sales, and payouts.

---

## Portal Authentication

[x] Password-based login (dev auth — "konsign" for all consignors)
[x] Cookie-based session management
[x] Auth guard on all portal routes
[ ] Production auth (email magic link or OAuth)

---

## Portal Dashboard

[x] Stats cards: Total Earnings, Active Listings (with inventory value), Items Sold, Total Sales
[x] Store-owned variant: Total Profit, Revenue, Cost breakdown
[x] Monthly earnings chart (6-month Recharts line chart)
[x] Payout breakdown (unbatched, awaiting invoice, invoice sent)
[x] Listing status breakdown (visual progress bars)
[x] Recent sales table (desktop)
[x] Notification bell with unread count

---

## Portal Listings

[x] Listing list with status filters (submitted, active, sold, cancelled, etc.)
[x] Search by product name, brand, styleId, size
[x] Lowest active price display per variant
[x] Inline price editing for active listings
[x] Withdrawal request workflow
[x] Status badges with color coding

---

## Portal Listing Creation

[x] Product search (debounced, searches existing catalog)
[x] New product creation (title, brand, category, size, GTIN)
[x] Brand autocomplete API
[x] Price input with validation
[x] Image upload (base64)
[x] Category/subcategory selection
[x] Edit submitted listings
[x] Delete submitted listings

---

## Portal Sales

[x] Sales history with order number, product, size, sale price, fee, payout
[x] Filter by status (sold, refunded)
[x] Search by order number or product name
[x] Payout status per item (unbatched, pending, paid)

---

## Portal Payouts

[x] Summary stats: Unbatched, Awaiting Invoice / Pending, Paid Out
[x] Unbatched sales section (expandable, itemized)
[x] Active payouts with item breakdown
[x] Mark Invoice Sent button (business consignors only)
[x] Individual consignors: invoice UI hidden, status shows "Processing"
[x] Payout history (paid)
[x] Mobile-responsive card layout + desktop table layout
[x] Store-owned consignors: "Not applicable" message

---

## Portal Profile

[x] Edit name, email, phone
[x] Tax status (individual / business)
[x] Province, GST number, QST number (business)
[x] Avatar color customization (11 options)
[x] Notification preferences toggle

---

## Portal Notifications

[x] Notification types: sale, payout, approved, rejected, withdrawal, pickup ready, withdrawn
[x] Bell icon with unread count in header
[x] Dismissible notifications (mark all as read)
[x] Notification preferences per consignor

---

## Barcode Support

[x] GTIN storage for variants
[ ] Barcode scanner integration
[ ] Camera scanning support
[ ] USB scanner support
[x] Variant auto-detection from GTIN

---

# Phase 5 — Advanced Marketplace Features

These features enhance the platform after the core system is stable.

---

## Pricing Intelligence

[ ] Market price tracking
[ ] Price suggestions
[ ] Automatic repricing

---

## Analytics

[ ] Sales analytics (trends, charts)
[ ] Product performance
[ ] Seller performance

---

# Phase 6 — UX Improvements

Final polish and design.

---

[x] Admin dashboard UI modernization (StatsCard, ActionItem, ActivityItem redesign)
[x] Consistent currency formatting ($1,000.00) across all pages
[x] Portal dark theme with glass morphism
[x] Mobile-responsive portal pages
[x] Staggered animations and hover effects
[ ] Implement Lovable UI design
[ ] Product card layouts
[ ] Seller statistics visualization

---

# Dev Tooling

[x] Test panel UI (embedded app, listing/order/refund testing)
[x] Dev store reset script (`scripts/reset-dev-store.ts`)
[x] Shopify state rebuild script (`scripts/rebuild-shopify-state.ts`)
[x] Vitest test suite — 297 tests (catalog, listings, inventory, orders, webhooks, categories, taxonomy, consignors, shopify-products, payouts, submission, listing-management, products)
[x] Separate test database (`test.sqlite`)
[x] Mock admin helper for Shopify API testing
[x] Comprehensive seed data (8 consignors incl. 2 shop consignors, 15 products, 51 variants, ~150 listings, 6 orders with transactions)

---

# Long-Term Features

Future expansion ideas.

---

[ ] StockX API integration (product import by Style ID)
[ ] Price history graphs
[ ] Buy-now / bid marketplace model
[ ] Multi-store marketplace
[ ] Mobile app
[ ] Production consignor auth (magic link / OAuth)
[ ] Barcode scanner (camera + USB)
[ ] Ledger inspection admin view
[x] Product catalog management (edit/merge)
[x] Consignor account suspension
[ ] Sales analytics & charts
