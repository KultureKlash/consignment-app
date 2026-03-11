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
[ ] Store product catalog locally
[ ] Product image import
[ ] Variant creation (sizes)

---

## Catalog Integrity

[ ] Enforce unique `styleId` for products
[ ] Prevent duplicate product creation
[ ] Validate size variants per product
[ ] Normalize brand and product naming

---

## Consignor Accounts

[ ] Consignor database model
[ ] Consignor login system
[ ] Consignor authentication (email / magic link)
[ ] Consignor profile management
[ ] Consignor dashboard base

---

## Listing Engine

[ ] Listing creation
[ ] Listing price input
[ ] Listing quantity input
[ ] Listing activation timestamp
[ ] Listing status (active / inactive)

---

## Shopify Product Sync

[ ] Create Shopify product from catalog
[ ] Create Shopify variants (sizes)
[ ] Store Shopify `productId` in database
[ ] Store Shopify `variantId` in database
[ ] Sync lowest listing price to Shopify

---

## Inventory Synchronization

[ ] Aggregate listing quantities per variant
[ ] Sync total inventory to Shopify variant
[ ] Trigger inventory sync when listing is created
[ ] Trigger inventory sync when listing quantity changes
[ ] Trigger inventory sync after order allocation

---

# Phase 2 — Marketplace Logic

These features enable multi-seller marketplace functionality.

---

## Listing Selection

[ ] FIFO listing allocation
[ ] Lowest price selection
[ ] Tie breaker using activation timestamp

---

## Order Processing

[ ] Shopify `orders/create` webhook
[ ] Variant detection from order
[ ] Listing allocation
[ ] Quantity deduction from listing
[ ] Listing deactivation when quantity = 0
[ ] Prevent oversell with database transactions

---

## Financial Ledger

[ ] Ledger table
[ ] Sale entry creation
[ ] Commission calculation
[ ] Consignor balance update

---

## Payout System

[ ] Payout request system
[ ] Admin payout approval
[ ] Payout record creation
[ ] Consignor balance deduction

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

# Long-Term Features

Future expansion ideas.

---

[ ] Price history graphs
[ ] Buy-now / bid marketplace model
[ ] Multi-store marketplace
[ ] Mobile app
