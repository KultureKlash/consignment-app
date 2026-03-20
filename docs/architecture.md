# Consignment Marketplace Architecture

This document defines the architecture and structure of the Shopify consignment marketplace application.

It explains how the system is organized and where logic belongs.

This document must be read before modifying the codebase.

---

# Technology Stack

Backend

- Node.js
- TypeScript
- React Router (Remix)
- Shopify Admin GraphQL API
- Prisma ORM
- SQLite (development)
- PostgreSQL (production)

Frontend

- React (inline CSSProperties, no Tailwind)
- Shopify Shadow DOM components (`s-page`, `s-section`, `s-button`, `s-app-nav`)
- Shopify App Bridge

---

# Application Type

This project is a **Shopify embedded app**.

Shopify provides:

- storefront
- checkout
- order creation
- admin authentication
- webhooks (orders/create, orders/cancelled, refunds/create)

The application provides:

- product catalog
- consignor accounts with configurable fee rates
- per-item listing engine
- order allocation (lowest price, FIFO tiebreak)
- financial ledger with audit-grade transaction snapshots
- payouts

---

# User Roles

The platform supports three user roles.

## Customers

Customers interact only with the **Shopify storefront**.

They browse products and complete checkout through Shopify.

---

## Consignors (Resellers)

Consignors log into the **marketplace dashboard inside the application**.

Capabilities:

- search products
- create listings
- manage inventory
- view sales
- request payouts

Consignors **do not access Shopify Admin**.

---

## Admin

Admins access the marketplace through an **embedded Shopify app inside Shopify Admin**.

```
Shopify Admin
↓
Apps
↓
Consignment App
↓
Admin Panel (Home, Create Listing, Listings, Orders, Consignors)
```

Admin pages:

- **Home** — dashboard overview with stats and recent activity
- **Create Listing** — form to create listings with product search, barcode/GTIN support, and 10 most recent listings
- **Listings** — full listing management with search, filters (status, category, subcategory, consignor), sorting, pagination, and grouped-by-product view
- **Orders** — order monitoring
- **Consignors** — consignor management with fee rates and balances

---

# System Architecture

The marketplace logic runs inside the application while Shopify acts only as the storefront.

```
Product Search (admin input / barcode / GTIN)
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

The **database is the source of truth**.

Shopify mirrors:

- product data
- lowest-tier price
- inventory count (active listings per variant at lowest price tier)

---

# Project Structure

```
app/
  routes/
    app._index.tsx          — Home dashboard
    app.inventory.tsx       — Create Listing page
    app.listings.tsx        — All Listings (filtered, paginated, grouped)
    app.orders.tsx          — Orders page
    app.consignors.tsx      — Consignors list page
    app.consignors.$id.tsx  — Consignor detail/edit page
    app.api.products.tsx    — Product search API
    app.api.brands.tsx      — Brand autocomplete API
    app.api.taxonomy.tsx    — Shopify taxonomy API
    app.tsx                 — App shell with nav
  services/
    catalog.server.ts       — Product/variant find-or-create
    dashboard.server.ts     — Dashboard stats and activity feed
    listings.server.ts      — Listing creation, cancellation, bulk cancellation
    listing-queries.server.ts — Listing search, filter, pagination
    orders.server.ts        — Order processing, refunds, cancellations, balance
    inventory.server.ts     — Shopify inventory sync
    shopify-products.server.ts — Shopify product/variant creation, image upload, backfill
    shopify-taxonomy.server.ts — Shopify taxonomy resolution
    webhooks.server.ts      — Webhook dedup and dispatch
  components/
    CreateListingForm.tsx   — Full listing creation form
    ListingsTable.tsx       — Flat + grouped-by-product table with thumbnails
    ListingsFilter.tsx      — Search, status, category, consignor filters
    QuickAddPopover.tsx     — Inline quick-add popover for existing products
    Pagination.tsx          — Page navigation
    CustomSelect.tsx        — Dropdown with label/value support
    Dropdown.tsx            — Portal-based dropdown (Shadow DOM compatible)
    StatsCard.tsx           — Dashboard stat card
    ActionItem.tsx          — Dashboard action item
    ActivityItem.tsx        — Dashboard activity item
  lib/
    listing-ui.ts           — Shared styles and helpers
    image-processing.ts     — Product image resize and white-square padding
    size-order.ts           — Size sorting (numeric + clothing sizes)
    categories/             — Category taxonomy data and helpers

prisma/
  schema.prisma             — 10 models

docs/
  architecture.md
  FEATURES.md
  system-diagram.md
  reseller-system-architecture.md
```

---

# Architecture Rule

The project follows a **service architecture**.

```
routes → services → prisma → database
```

Routes must **never contain business logic**.

Routes only:

- authenticate requests
- call services
- return responses

Route files should stay under ~200 lines. Business logic lives in **services**.

---

# Services Layer

Services contain the core marketplace logic.

```
app/services/
```

Current services:

```
catalog.server.ts            — findOrCreateProduct, findOrCreateVariant
dashboard.server.ts          — getDashboardData (stats, activity feed)
listings.server.ts           — createListing, cancelListing, bulkCancelListings
listing-queries.server.ts    — queryListings (search, filter, sort, paginate)
consignors.server.ts         — getConsignorDetail, updateConsignor
orders.server.ts             — processOrder, cancelOrder, refundOrder, creditOrder, getConsignorBalance
inventory.server.ts          — syncVariantInventory
shopify-products.server.ts   — ensureShopifyProductAndVariant, backfillProductImages
shopify-taxonomy.server.ts   — resolveShopifyTaxonomyId
webhooks.server.ts           — withWebhookDedup
```

---

## Catalog Service

Handles product catalog operations.

Functions:

```
findOrCreateProduct(styleId, title, brand, category)
findOrCreateVariant(productId, size, gtin)
```

Products are uniquely identified by **styleId** (when provided) or by **title + brand** (non-footwear path).

Variants are unique by **(productId, size)**.

Variants may include a **GTIN barcode** for scanner identification.

---

## Listings Service

Handles consignor listings.

Functions:

```
createListing(admin, consignorId, variantId, price, count)
cancelListing(admin, listingId)
bulkCancelListings(admin, listingIds)
```

**Per-item model**: each Listing row = 1 physical item. No quantity field. Creating 3 items at $200 creates 3 separate Listing rows.

After creation, triggers Shopify product sync and inventory sync.

`bulkCancelListings` batches DB updates in a single transaction, then syncs inventory once per affected variant with exponential backoff retry (3 attempts).

---

## Listing Queries Service

Server-side search, filter, sort, and pagination for the listings admin page.

```
queryListings({ search, status, category, consignorId, sortBy, sortDir, page, limit })
```

SQLite-compatible text search across product title, styleId, brand, consignor name/email.

---

## Inventory Service

Synchronizes Shopify inventory to reflect marketplace state.

Rule:

```
Shopify inventory = COUNT(active listings at lowest price tier for variant)
Shopify price = lowest active listing price for variant
```

Deletes Shopify variant when inventory reaches zero (unless last variant).

---

## Orders Service

Handles the full order lifecycle via Shopify webhooks.

Functions:

```
processOrder()    — allocate listings, create order items
creditOrder()     — create sale transactions when payment captured
cancelOrder()     — restore listings, create void/refund transactions
refundOrder()     — partial or full refund with restock options
getConsignorBalance() — sum transactions minus completed payouts
```

Allocation rule:

```
1. Lowest price first
2. FIFO tiebreak (oldest createdAt)
```

Refund priority (reverse allocation):

```
1. Highest price first
2. Newest first
```

---

## Shopify Products Service

Creates and manages Shopify products and variants.

```
ensureShopifyProductAndVariant(admin, variant)
```

SKU derivation: footwear products use styleId as SKU, non-footwear use GTIN/barcode.

Resilient — if Shopify sync fails, the listing is still created locally.

---

## Consignors Service

Handles consignor profile management.

Functions:

```
getConsignorDetail(id)     — consignor profile + balance + listing status counts
updateConsignor(id, data)  — update name, email, feeRate with validation
```

Validates email uniqueness and restricts fee rate to 10%, 15%, or 20%.

---

## Payouts Service (planned)

Will handle consignor balances and payouts.

Planned functions:

```
requestPayout()
approvePayout()
markPayoutPaid()
```

---

## StockX Integration Service (planned)

Will handle product catalog import from StockX.

Planned functions:

```
importStockXProduct(styleId)
fetchProductImages(styleId)
fetchMarketPrice(styleId)
```

---

# Database Models

The system uses the following Prisma models:

```
Session          — Shopify OAuth sessions
Consignor        — Seller accounts with fee rate
Product          — Catalog items (styleId, brand, category, imageUrl)
Variant          — Sizes with optional GTIN barcode
Listing          — Per-item inventory (1 row = 1 physical item)
Order            — Shopify orders with payment status tracking
OrderItem        — 1:1 mapping to allocated listings
Transaction      — Audit-grade financial records (sale/refund)
WebhookEvent     — Idempotent webhook processing
Payout           — Consignor payout records
```

Data flow:

```
Product
↓
Variant (size + GTIN)
↓
Listing (per-item, 1 row = 1 physical item)
↓
OrderItem (1:1 with listing)
↓
Transaction (immutable audit snapshot)
↓
Payout
```

---

# Marketplace Rules

## Product Rule

Products are unique by `styleId` (when provided).

Example:

```
Nike Dunk Panda
styleId: DD1391-100
```

Products without a styleId are identified by title + brand.

---

## Variant Rule

Variants represent sizes.

Example:

```
Size 8
Size 9
Size 10
```

Unique constraint: `(productId, size)`

Optional GTIN barcode per variant.

---

## Listing Rule

**Per-item model**: each Listing row = 1 physical item. No quantity field.

Multiple consignors may list the same variant at different prices.

Example:

```
Product: Nike Dunk Panda
Variant: Size 9

Consignor A → $430 (1 listing row)
Consignor A → $430 (1 listing row)
Consignor B → $450 (1 listing row)
Consignor C → $470 (1 listing row)
```

Statuses: `active`, `pending_sale`, `sold`, `cancelled`

---

## Inventory Rule

Shopify inventory reflects the count of active listings at the lowest price tier.

```
Shopify price = MIN(active listing prices)
Shopify inventory = COUNT(active listings at that price)
```

---

## Fee Rate Rule

Consignors have a configurable **fee rate** (e.g. 10%, 15%, 20%).

The fee rate is the marketplace's cut. The consignor keeps the remainder.

Example:

```
Fee rate: 15%
Sale price: $200
Fee: $30 (200 × 0.15)
Consignor payout: $170 (200 - 30)
```

Transaction records snapshot the fee rate at creation time (immutable audit trail).

---

# Important Rule

Business logic must stay in **services**.

Never move marketplace logic into routes.

```
routes → services → prisma → database
```
