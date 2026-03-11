# Reseller / Consignment Marketplace Architecture

## Overview

This project is a custom **multi-seller consignment marketplace** built on top of Shopify.

Shopify is used as the **customer storefront**, while the marketplace logic runs inside a **custom application**.

The application manages:

* product catalog
* consignor accounts
* listings
* order allocation
* financial ledger
* payouts

The system is designed to behave similarly to **StockX-style marketplaces** where multiple sellers can sell the same product variant.

---

# Technology Stack

## Backend

* Node.js
* Remix framework
* Shopify Admin GraphQL API
* Prisma ORM
* PostgreSQL database

## Frontend

* React
* Shopify Polaris
* Shopify App Bridge

## Integrations

* Shopify Storefront
* StockX Product Catalog API
* Barcode scanning (GTIN)

---

# Core Marketplace Principles

## Product Source

Products are **not manually created in Shopify**.

Instead the catalog comes from:

StockX API → Our App → Shopify Product

Products are created automatically using:

* style_id
* name
* brand
* images
* release date
* sizes

---

# Product Identification

Each product is uniquely identified by:

Style ID (brand identifier)

Example:

DZ5485-612

Variants represent **sizes**.

Example:

Size 7
Size 8
Size 9
Size 10

Each variant may also contain a **GTIN barcode** used for scanning.

---

# Listing System

Multiple consignors can create listings for the **same product variant**.

Example:

Jordan 1 Chicago Size 10

Seller A → $430
Seller B → $450
Seller C → $470

Listings contain:

* consignor_id
* variant_id
* price
* quantity
* status
* activated_at

---

# Shopify Price Logic

Shopify product variant price always equals:

**Lowest active listing price**

Example:

Listings

430
450
470

Shopify storefront shows:

430

---

# Sale Allocation Rule

When an order is received, the system selects a listing using:

1. Lowest price
2. FIFO tie breaker (earliest activated listing)

Example:

Seller A → $430 → activated 10:00
Seller B → $430 → activated 11:00

Seller A sells first.

---

# Order Processing Flow

Customer purchase flow:

Customer → Shopify Storefront → Order Created

Shopify sends webhook:

Order Created Webhook → Our App

The application then:

1. Identifies variant purchased
2. Selects listing using FIFO logic
3. Deducts quantity
4. Creates ledger entries
5. Updates Shopify price if needed

---

# Financial Ledger System

Instead of calculating balances inside orders, the system records every financial event.

Ledger entries include:

Sale
Commission
Payout

Example:

Sale: +430
Commission: −64.50
Consignor Balance: +365.50

This provides a complete financial audit trail.

---

# Consignor Dashboard

Consignors can:

* search products
* scan barcode (GTIN)
* create listings
* view inventory
* view sales
* request payouts

---

# Admin Dashboard

Admins can:

* manage consignors
* approve listings
* monitor inventory
* monitor sales
* trigger payouts

---

# Inventory Model

Inventory exists **only in our database**.

Shopify inventory is used only for storefront availability.

Listings control the true inventory.

---

# Barcode Scanning

Products can be identified using:

Search (StockX catalog)

or

Barcode scan (GTIN)

Barcode scanning supports:

* mobile camera
* webcam
* USB barcode scanners

---

# Webhook Architecture

Shopify sends events for:

Order created
Order cancelled
Refund created

The application processes these events to update listings and ledger entries.

---

# Development Strategy

The system is built in phases.

Phase 1 – Core Engine
Phase 2 – Functional Dashboard
Phase 3 – Final UI Implementation

Design prototypes (Lovable project) will be implemented after the core engine is stable.

---

# Deployment Strategy

Development Store → Development Environment
Testing Store → Staging Environment
Main Store → Production Environment

The application can be installed on multiple Shopify stores without changing business logic.
