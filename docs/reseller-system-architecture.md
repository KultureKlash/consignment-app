# Reseller / Consignment Marketplace Architecture

## Overview

This project is a custom **multi-seller consignment marketplace** built on top of Shopify.

Shopify is used as the **customer storefront**, while the marketplace logic runs inside a **custom application**.

The application manages:

• product catalog
• consignor accounts
• listings
• order allocation
• financial ledger
• payouts

The system behaves similarly to **StockX-style marketplaces** where multiple sellers can sell the same product variant.

---

# User Roles

The platform supports three primary user types.

## Customers

Customers interact only with the **Shopify storefront**.

They browse products, add items to cart, and complete checkout through Shopify.

---

## Consignors (Resellers)

Consignors log into the **marketplace application dashboard**.

They can:

• search products
• create listings
• manage inventory
• view sales
• request payouts

Consignors **do not access Shopify admin**.

---

## Admin (Store Owner)

Admins access the marketplace through an **embedded Shopify app** inside Shopify Admin.

They can:

• manage consignors
• monitor listings
• inspect inventory
• review orders
• approve payouts
• manage catalog data

---

# Technology Stack

## Backend

• Node.js
• Remix framework
• Shopify Admin GraphQL API
• Prisma ORM
• PostgreSQL database (SQLite used in development)

## Frontend

• React
• Shopify Polaris
• Shopify App Bridge

## Integrations

• Shopify Storefront
• StockX Product Catalog API
• Barcode scanning (GTIN)

---

# System Architecture

```
StockX API
     ↓
Catalog Import Service
     ↓
Database (Source of Truth)
     ↓
Shopify Sync Service
     ↓
Shopify Storefront
     ↓
Customers
     ↓
Shopify Webhooks
     ↓
Order Allocation Engine
     ↓
Ledger & Payout System
```

The **database is the source of truth** for products, listings, inventory, and financial records.

Shopify mirrors catalog data and inventory for storefront display.

---

# Admin Interface

Admins manage the marketplace inside Shopify.

```
Shopify Admin
     ↓
Apps
     ↓
Consignment App
     ↓
Admin Dashboard
```

---

# Consignor Interface

Consignors log into the **marketplace dashboard**.

```
Marketplace Login
     ↓
Consignor Dashboard
     ↓
Listings / Inventory / Sales / Payouts
```

---

# Product Catalog

Products originate from StockX.

```
StockX API → Catalog Import → Database → Shopify Product
```

Products include:

• style_id
• brand
• product name
• images
• release date
• sizes

---

# Product Identification

Products are uniquely identified by **Style ID**.

Example:

```
DZ5485-612
```

Variants represent **sizes**.

Example:

```
Size 7
Size 8
Size 9
Size 10
```

Variants may include a **GTIN barcode**.

---

# Shopify Product Mapping

Each catalog item maps to Shopify:

Products

• shopify_product_id

Variants

• shopify_variant_id

---

# Listing System

Multiple consignors may create listings for the **same variant**.

Example:

Jordan 1 Chicago Size 10

Seller A → $430
Seller B → $450
Seller C → $470

Listings include:

• consignor_id
• variant_id
• price
• quantity
• status
• activated_at

---

# Shopify Price Logic

Shopify variant price equals:

**Lowest active listing price**

Example:

Listings

430
450
470

Shopify storefront shows:

430

---

# Inventory Model

Inventory exists in the **database**.

Shopify inventory mirrors the aggregated quantity.

```
Shopify Inventory = SUM(listings.quantity)
```

---

# Order Processing

Customer purchase flow:

```
Customer → Shopify Storefront → Order Created
```

Shopify sends a webhook.

The application:

1. identifies variant
2. selects listing
3. deducts quantity
4. records ledger entry
5. syncs inventory

---

# Ledger System

Every financial event is recorded.

Entries include:

• Sale
• Commission
• Payout

This provides a full financial audit trail.

---

# Deployment

Dev Store → Development
Testing Store → Staging
Production Store → Live Marketplace
