# Reseller / Consignment Marketplace Architecture

## Overview

This project is a custom **multi-seller consignment marketplace** built on top of Shopify.

Shopify is used as the **customer storefront**, while the marketplace logic runs inside a **custom embedded application**.

The application manages:

- product catalog (with categories, GTIN barcodes)
- consignor accounts (with configurable fee rates)
- per-item listings (1 row = 1 physical item)
- order allocation (lowest price, FIFO tiebreak)
- financial ledger (audit-grade transaction snapshots)
- payouts

The system behaves similarly to **StockX-style marketplaces** where multiple sellers can sell the same product variant.

---

# User Roles

The platform supports three primary user types.

## Customers

Customers interact only with the **Shopify storefront**.

They browse products, add items to cart, and complete checkout through Shopify.

---

## Consignors (Resellers)

Consignors log into the **marketplace application dashboard** (future phase).

They can:

- search products
- create listings
- manage inventory
- view sales
- request payouts

Consignors **do not access Shopify admin**.

---

## Admin (Store Owner)

Admins access the marketplace through an **embedded Shopify app** inside Shopify Admin.

They can:

- create listings (with product search, barcode/GTIN support)
- manage all listings (search, filter, sort, paginate, grouped-by-product view)
- monitor orders
- manage consignors (fee rates, balances)
- review financial ledger
- approve payouts

---

# Technology Stack

## Backend

- Node.js
- TypeScript
- React Router (Remix)
- Shopify Admin GraphQL API
- Prisma ORM
- PostgreSQL database (SQLite used in development)

## Frontend

- React with inline CSSProperties (no Tailwind, no CSS files)
- Shopify Shadow DOM components (`s-page`, `s-section`, `s-button`, `s-app-nav`)
- Shopify App Bridge
- Portal-based dropdowns (for Shadow DOM compatibility)

## Integrations

- Shopify Storefront (product/inventory mirror)
- Shopify Webhooks (orders/create, orders/cancelled, refunds/create)
- Shopify Taxonomy API (product categorization)
- Barcode / GTIN support

---

# System Architecture

```
Admin Input (product search / barcode / GTIN)
     ↓
Catalog Service (findOrCreate Product + Variant)
     ↓
Database (Source of Truth)
     ↓
Shopify Sync Service (product, variant, price, inventory)
     ↓
Shopify Storefront
     ↓
Customers
     ↓
Shopify Webhooks (orders/create, orders/cancelled, refunds/create)
     ↓
Order Allocation Engine (lowest price, FIFO)
     ↓
Financial Ledger (fee rate snapshots, audit trail)
     ↓
Payout System
```

The **database is the source of truth** for products, listings, inventory, and financial records.

Shopify mirrors catalog data, lowest-tier pricing, and inventory counts for storefront display.

---

# Admin Interface

Admins manage the marketplace inside Shopify Admin.

```
Shopify Admin
     ↓
Apps
     ↓
Consignment App
     ↓
Admin Panel
  ├── Home (dashboard with stats, activity, actions)
  ├── Create Listing (form with product search + barcode)
  ├── Listings (search, filters, sort, pagination, grouped view)
  ├── Orders (monitoring)
  └── Consignors (fee rates + balances)
```

---

# Consignor Interface

Consignors will log into the **marketplace dashboard** (future phase).

```
Marketplace Login
     ↓
Consignor Dashboard
     ↓
Listings / Inventory / Sales / Payouts
```

---

# Product Catalog

Products are created through admin input (search or manual entry).

```
Admin Search / Manual Entry → Catalog Service → Database → Shopify Product
```

Products include:

- title
- styleId (optional, unique when present)
- brand
- category / subcategory
- variants (sizes)
- GTIN barcodes per variant

---

# Product Identification

Products are uniquely identified by **Style ID** (when available).

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

Variants may include a **GTIN barcode** for scanner identification.

Unique constraint: `(productId, size)`

---

# Shopify Product Mapping

Each catalog item maps to Shopify:

Products

- shopifyProductId

Variants

- shopifyVariantId
- inventoryItemId

Sync is resilient — if Shopify API fails, local data is still created.

---

# Listing System

**Per-item model**: each database row = 1 physical item. No quantity field.

Multiple consignors may create listings for the **same variant** at different prices.

Example:

```
Jordan 1 Chicago Size 10

Seller A → $430 (1 listing row)
Seller A → $430 (1 listing row)
Seller B → $450 (1 listing row)
Seller C → $470 (1 listing row)
```

Listing statuses: `active`, `pending_sale`, `sold`, `cancelled`

Listings include:

- consignorId
- variantId
- price
- status
- lifecycle timestamps (createdAt, receivedAt, authenticatedAt, listedAt, soldAt, withdrawnAt)

---

# Shopify Price Logic

Shopify variant price equals:

**Lowest active listing price**

Example:

```
Listings: $430, $430, $450, $470

Shopify storefront shows: $430
Shopify inventory: 2 (count at lowest price tier)
```

---

# Inventory Model

Inventory exists in the **database**.

Shopify inventory mirrors the count of active listings at the lowest price tier.

```
Shopify Inventory = COUNT(active listings at lowest price)
```

---

# Order Processing

Customer purchase flow:

```
Customer → Shopify Storefront → Order Created → Webhook
```

Shopify sends an `orders/create` webhook.

The application:

1. identifies variant from line items
2. finds active listings (price ASC, createdAt ASC)
3. allocates 1 listing per order item
4. marks listings as pending_sale
5. creates OrderItem records (1:1 with listings)
6. syncs inventory back to Shopify

When payment is captured (`creditOrder`):

1. creates sale Transaction per OrderItem
2. snapshots fee rate, sale price, amounts
3. marks listings as sold

---

# Fee Rate System

Consignors have a configurable **fee rate** (e.g. 10%, 15%, 20%).

The fee rate is the **marketplace's cut**. The consignor keeps the remainder.

Example:

```
Fee rate: 15%
Sale price: $200

Fee amount: $30 (200 × 0.15)
Consignor payout: $170 (200 - 30)
```

Default fee rate: 15%

---

# Ledger System

Every financial event is recorded with audit-grade detail.

Transaction fields (immutable snapshots):

- salePrice — unit price at time of sale
- feeRate — consignor's fee rate at time of sale
- grossAmount — sale price (per item)
- feeAmount — marketplace's fee (grossAmount × feeRate)
- consignorAmount — consignor's share (grossAmount - feeAmount)
- amount — net amount for balance (positive for sales, negative for refunds)

Entry types:

- Sale — created when payment captured
- Refund — created when order refunded or cancelled

This provides a full financial audit trail. Fee rate changes after a sale do not affect existing transactions.

---

# Refund & Cancellation

The system supports:

- **Full order cancellation** — restores all listings to active
- **Full refund** — restores all items with refund transactions
- **Partial refund** — per-item selection, reverse priority (highest price first)
- **Restock options** — return (restore inventory), cancel, no_restock

Refund transactions mirror sale transactions with negative amounts.

---

# Future: StockX Integration (planned)

Products will be importable from StockX via Style ID.

```
StockX API → Catalog Import Service → Database → Shopify Product
```

StockX data includes:

- style_id
- brand
- product name
- images
- release date
- sizes
- market prices

---

# Future: Barcode Scanning (planned)

Consignors and admins will be able to scan barcodes to identify products.

```
Barcode Scan (camera / USB) → GTIN Lookup → Variant Auto-Detection → Listing Creation
```

---

# Future: Analytics & Pricing Intelligence (planned)

- Market price tracking
- Price suggestions based on market data
- Automatic repricing
- Sales analytics per product / seller
- Product performance metrics

---

# Future: Notifications (planned)

- Listing sold notification
- Payout processed notification
- Low inventory alerts
- Approval / rejection notifications for consignors

---

# Deployment

```
Dev Store → Development (SQLite)
Testing Store → Staging
Production Store → Live Marketplace (PostgreSQL)
```
