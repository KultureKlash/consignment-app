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

[ ] Remix Shopify app setup
[ ] PostgreSQL database
[ ] Prisma ORM configuration
[ ] Environment configuration
[ ] Shopify OAuth authentication

---

## Product Catalog

[ ] StockX API integration
[ ] Product import by Style ID
[ ] Variant creation (sizes)
[ ] Product image import
[ ] Store product catalog locally

---

## Barcode Support

[ ] GTIN storage for variants
[ ] Barcode scanner integration
[ ] Camera scanning support
[ ] USB scanner support
[ ] Variant auto-detection from barcode

---

## Consignor Accounts

[ ] Consignor database model
[ ] Consignor login system
[ ] Consignor dashboard
[ ] Consignor profile management

---

## Listing Engine

[ ] Listing creation
[ ] Listing price input
[ ] Listing quantity input
[ ] Listing activation timestamp
[ ] Listing status (active/inactive)

---

## Shopify Sync

[ ] Create Shopify product from catalog
[ ] Create Shopify variants
[ ] Update Shopify variant price
[ ] Sync lowest listing price to Shopify

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

[ ] Shopify order webhook
[ ] Variant detection from order
[ ] Listing allocation
[ ] Quantity deduction
[ ] Listing deactivation when quantity = 0

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

# Phase 4 — Admin Tools

Controls marketplace operations.

---

## Admin Dashboard

[ ] Consignor management
[ ] Product catalog management
[ ] Listing moderation
[ ] Order monitoring

---

## Financial Admin

[ ] Ledger inspection
[ ] Payout management
[ ] Commission configuration

---

# Phase 5 — Advanced Marketplace Features

These features will enhance the platform later.

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
