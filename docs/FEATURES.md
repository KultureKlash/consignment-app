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
[x] Store product catalog locally
[ ] Product image import
[x] Variant creation (sizes)

---

## Catalog Integrity

[x] Enforce unique `styleId` for products
[x] Prevent duplicate product creation
[x] Validate size variants per product
[ ] Normalize brand and product naming

---

## Consignor Accounts

[x] Consignor database model
[ ] Consignor login system
[ ] Consignor authentication (email / magic link)
[ ] Consignor profile management
[ ] Consignor dashboard base

---

## Listing Engine

[x] Listing creation
[x] Listing price input
[x] Listing quantity input
[x] Listing activation timestamp
[x] Listing status (active / sold / cancelled)
[x] Same consignor + same variant upserts quantity (pricing rule)

---

## Shopify Product Sync

[x] Create Shopify product from catalog
[x] Create Shopify variants (sizes)
[x] Store Shopify `productId` in database
[x] Store Shopify `variantId` in database
[x] Sync lowest listing price to Shopify

---

## Inventory Synchronization

[x] Aggregate listing quantities per variant
[x] Sync total inventory to Shopify variant
[x] Trigger inventory sync when listing is created
[x] Trigger inventory sync when listing quantity changes
[x] Trigger inventory sync after order allocation
[x] Delete Shopify variant when inventory reaches zero (unless last variant)

---

# Phase 2 — Marketplace Logic

These features enable multi-seller marketplace functionality.

---

## Listing Selection

[x] FIFO listing allocation
[x] Lowest price selection
[x] Tie breaker using activation timestamp

---

## Order Processing

[x] Shopify `orders/create` webhook
[x] Variant detection from order
[x] Listing allocation (FIFO lowest-price-first)
[x] Quantity deduction from listing
[x] Listing deactivation when quantity = 0
[x] Prevent oversell with database transactions
[x] Idempotent order processing (duplicate webhook protection)

---

## Refund & Cancellation

[x] Shopify `orders/cancelled` webhook
[x] Shopify `refunds/create` webhook
[x] Full order cancellation (cancelOrder)
[x] Full refund (refundOrder)
[x] Partial refund support (per-line-item quantity)
[x] Reverse-priority allocation (highest-price refunded first)
[x] Void vs refund distinction (payment captured or not)
[x] Restock handling (return / cancel / no_restock)
[x] Inventory re-sync after refund

---

## Financial Ledger

[x] Transaction model (sale / refund types)
[x] Sale entry creation per allocated unit
[x] Commission calculation (grossAmount x commissionRate)
[x] Consignor balance tracking (sum transactions minus payouts)
[x] Snapshot audit fields (immutable at creation time)

---

## Payout System

[x] Payout database model
[x] Balance calculation respects completed payouts
[ ] Payout request system
[ ] Admin payout approval
[ ] Payout record creation

---

# Phase 3 — Consignor Experience

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

[ ] GTIN storage for variants
[ ] Barcode scanner integration
[ ] Camera scanning support
[ ] USB scanner support
[ ] Variant auto-detection from barcode

---

# Phase 4 — Admin Tools

Admins manage the marketplace from **inside Shopify Admin**.

---

## Admin Dashboard (Embedded Shopify App)

[ ] Marketplace overview
[ ] Consignor management
[ ] Product catalog management
[ ] Listing moderation
[ ] Order monitoring
[ ] Consignor account freeze / suspension

---

## Financial Admin

[ ] Ledger inspection
[ ] Payout management
[ ] Commission configuration

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

[ ] Sales analytics
[ ] Product performance
[ ] Seller performance

---

## Notifications

[ ] Listing sold notification
[ ] Payout processed notification
[ ] Low inventory alerts

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
[x] Vitest test suite (catalog, listings, inventory, orders, webhooks)

---

# Long-Term Features

Future expansion ideas.

---

[ ] Price history graphs
[ ] Buy-now / bid marketplace model
[ ] Multi-store marketplace
[ ] Mobile app
