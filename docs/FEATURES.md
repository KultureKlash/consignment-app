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
Log into the marketplace dashboard inside the application.

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
[ ] Consignor login system
[ ] Consignor authentication (email / magic link)
[ ] Consignor profile management
[ ] Consignor dashboard base

---

## Listing Engine

[x] Per-item listing model (each DB row = 1 physical item, no quantity field)
[x] Listing creation (count parameter creates N individual listings)
[x] Listing price input
[x] Listing cancellation with inventory re-sync
[x] Bulk listing cancellation with batched DB updates and per-variant Shopify sync with retry
[x] Lifecycle timestamps (createdAt, receivedAt, authenticatedAt, listedAt, soldAt, withdrawnAt)
[x] Listing statuses: active, pending_sale, sold, cancelled
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
[x] Balance calculation respects completed payouts
[ ] Payout request system
[ ] Admin payout approval
[ ] Payout record creation

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

---

## Admin Dashboard (Home)

[x] Stats cards (active listings, consignors, etc.)
[x] Recent activity feed (5 items, expandable to 15)
[x] Quick action items

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
[x] Quantity selector (creates N individual listings)
[x] 10 most recent listings table (flat view)
[x] "View all" link to full listings page

---

## Listings Page

[x] Server-side search (product title, styleId, brand, consignor name/email)
[x] Status filter (All, Active, Pending, Sold, Cancelled) — defaults to Active
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

---

## Consignors Page

[x] Consignor list with name, email, fee rate, balance
[x] Balance calculation per consignor
[x] Clickable rows → navigate to consignor detail page
[x] Consignor detail page (view/edit name, email, fee rate)
[x] Copy consignor ID to clipboard
[x] Listing status counts (active, pending sale, sold, cancelled)
[x] Link to payouts tab from consignor detail

---

## Orders Page

[x] Order list (basic view)

---

## Admin Tools (remaining)

[ ] Marketplace overview dashboard (charts, metrics)
[ ] Product catalog management
[ ] Listing moderation (approve / reject)
[ ] Order detail view
[ ] Consignor account freeze / suspension
[ ] Ledger inspection view
[ ] Payout management UI
[ ] Fee rate configuration per consignor (UI)

---

# Phase 4 — Consignor Experience

Improves usability for sellers.

---

## Consignor Dashboard

[ ] Inventory overview
[ ] Sales history
[ ] Earnings summary
[ ] Listing management

---

## Product Search

[ ] Catalog search
[ ] Product filters
[ ] Variant selection

---

## Listing Creation UI

[ ] Search product
[ ] Scan barcode
[ ] Enter price
[ ] Enter quantity

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

## Financial Admin

[ ] Ledger inspection
[ ] Payout management
[ ] Fee rate configuration per consignor (UI)

---

## Pricing Intelligence

[ ] Market price tracking
[ ] Price suggestions
[ ] Automatic repricing

---

## Analytics

[ ] Sales analytics
[ ] Product performance
[ ] Seller performance

---

## Notifications

[ ] Listing sold notification
[ ] Payout processed notification
[ ] Low inventory alerts
[ ] Approval/rejection notifications for consignors

---

# Phase 6 — UX Improvements

Final polish and design.

---

[ ] Implement Lovable UI design
[ ] Custom dashboard components
[ ] Product card layouts
[ ] Seller statistics visualization

---

# Dev Tooling

[x] Test panel UI (embedded app, listing/order/refund testing)
[x] Dev store reset script (`scripts/reset-dev-store.ts`)
[x] Shopify state rebuild script (`scripts/rebuild-shopify-state.ts`)
[x] Vitest test suite — 197 tests (catalog, listings, inventory, orders, webhooks, categories, taxonomy, consignors, shopify-products)
[x] Separate test database (`test.sqlite`)
[x] Mock admin helper for Shopify API testing
[x] Comprehensive seed data (6 consignors, 15 products, 51 variants, ~150 listings, 6 orders with transactions)

---

# Long-Term Features

Future expansion ideas.

---

[ ] Price history graphs
[ ] Buy-now / bid marketplace model
[ ] Multi-store marketplace
[ ] Mobile app
