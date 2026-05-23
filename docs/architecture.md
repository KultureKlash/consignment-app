# Consignment Marketplace Architecture

This document defines the architecture and structure of the Shopify consignment marketplace application.

It explains how the system is organized and where logic belongs.

This document must be read before modifying the codebase.

---

# Technology Stack

Backend

- Node.js
- TypeScript
- React Router 7 (Remix-style file routing)
- Shopify Admin GraphQL API (October 2025)
- Prisma ORM
- PostgreSQL (Docker local dev, Neon cloud prod)

Frontend

- React with Tailwind CSS (admin + portal)
- Shopify Shadow DOM components (`s-page`, `s-section`, `s-button`, `s-app-nav`)
- Shopify App Bridge
- Framer Motion (animations)
- Lucide React (icons)

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

Consignors log into the **portal** (standalone, dark glass theme, OTP email login).

Capabilities:

- Dashboard with earnings chart, stats, notifications
- Search products and submit listings
- View and manage active listings (inline price edit, withdrawal request)
- View sales history with date filters and PDF export
- View payouts, upload invoices (business), mark invoice sent
- Edit profile, tax status, notification preferences

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

- **Home** — dashboard overview with stats, action items, activity feed, financial stats toggle
- **Create Listing** — form to create listings with product search, barcode/GTIN support, and 10 most recent listings
- **Listings** — full listing management with search, filters (status, category, subcategory, consignor, section), sorting, pagination, grouped-by-product view, bulk actions, retry Shopify sync
- **Orders** — order list + detail page (items, ledger, timeline, cost/profit for store-owned)
- **Consignors** — consignor management with fee rates, balances, suspension
- **Payouts** — unpaid, pending, history sections with CSV download
- **Sections** — store section management (add/rename/delete)

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
  routes/                        — Flat dot-notation (app.*, portal.*, webhooks.*, health)
    app._index.tsx               — Home dashboard
    app.inventory.tsx            — Create Listing page
    app.listings.tsx             — All Listings (filtered, paginated, grouped)
    app.orders.tsx               — Orders page
    app.orders_.$id.tsx          — Order detail page
    app.consignors.tsx           — Consignors list page
    app.consignors_.$id.tsx      — Consignor detail/edit page
    app.payouts.tsx              — Payout management page
    app.sections.tsx             — Store section management
    app.activity.tsx             — Full activity feed page
    app.api.products.tsx         — Product search API
    app.api.brands.tsx           — Brand autocomplete API
    app.api.taxonomy.tsx         — Shopify taxonomy API
    app.api.impersonate.tsx      — Generate portal impersonation token
    app.api.invoice.$id.tsx      — Download invoice PDF
    portal.dashboard.tsx         — Consignor dashboard
    portal.listings.tsx          — Consignor listings (infinite scroll mobile)
    portal.listings_.new.tsx     — Submit new listing
    portal.payouts.tsx           — Consignor payouts
    portal.sales.tsx             — Sales history
    portal.profile.tsx           — Profile edit
    portal_.login.tsx            — OTP email login
    webhooks.orders.create.tsx   — Process new order
    webhooks.orders.fulfilled.tsx — Mark fulfilled, consignor sees "sold"
    webhooks.refunds.create.tsx  — Process refund
    health.tsx                   — Health check endpoint
    app.tsx                      — App shell with nav

  services/                      — Domain-organized, barrel exports
    admin/                       — Admin dashboard, listing-actions dispatcher, payouts
    catalog/                     — Product/variant find-or-create
    consignors/                  — Consignor CRUD, suspension
    email/                       — 8 transactional email templates (Resend)
    inventory/                   — Shopify inventory sync
    listings/                    — Listing mutations + queries
    orders/                      — Order processing, refunds, balance
    otp/                         — OTP generation + verification
    portal/                      — Consignor auth, dashboard, sales, payouts, products
    shopify/                     — Shopify product sync, taxonomy
    submission/                  — Submission lifecycle (approve, edit, withdraw, bulk)
    webhooks/                    — Webhook idempotency (WebhookEvent dedup)

  components/
    admin/
      shared/                    — StatsCard, ActionItem, ActivityItem, CustomSelect, Dropdown, DateRangeFilter
      listings/                  — ListingsTable, GroupedView, FlatView, GroupRows (Desktop/Mobile), modals, ListingActionsContext, BulkActionBar
      create-listing/            — CreateListingForm + Context + sub-components
      payouts/                   — UnpaidSection, PendingSection, HistorySection
      consignors/                — ConsignorsListPage, ConsignorDetailPage, ConsignorForm, ConsignorListingsSummary
      orders/                    — OrdersListPage, OrderDetailPage, OrderItems, OrderLedger, OrderTimeline
      sections/                  — SectionsPage
    portal/
      shared/                    — AppHeader, Sidebar, GlassSelect, DateRangePicker, InfoTip
      auth/                      — LoginPage
      dashboard/                 — DashboardPage
      listings/                  — ListingGroup, MobileDetailDrawer, InlinePrice, StatusTabs
      listings/new/              — NewListingPage, ProductSearchGrid, ProductForm
      payouts/                   — PayoutsPage, PayoutsSummary, UnbatchedSection, ActivePayouts, PaidHistory
      profile/                   — ProfilePage, TaxSettings, AccountInfo
      sales/                     — SalesPage

  lib/
    domain/                      — LISTING_STATUS, ORDER_STATUS, PAYOUT_STATUS, TRANSACTION_TYPE, CONSIGNOR_STATUS
    finance/                     — calculateFee, computeTax
    formatting/                  — csv, currency (fmt), pdf
    system/                      — env, logger, rate-limit, sentry
    categories/                  — Constants, auto-suggest, barcode, helpers
    validation.ts                — Zod schemas
    size-order.ts                — Size sorting
    image-processing.ts          — Product image resize
    deriveProductMetafields.ts   — age_group + target_gender

prisma/
  schema.prisma                  — 14 models (Session, Consignor, Product, Variant, Listing, Order, OrderItem, Transaction, Payout, PayoutItem, WebhookEvent, ReassignmentLog, OtpCode, StoreSection)

tests/                           — 350+ Vitest tests
docs/                            — Architecture, features, standards, checklists
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

Services contain the core marketplace logic. Organized into domain folders with barrel exports.

```
app/services/
  admin/         — Dashboard stats, listing-actions dispatcher, payouts
  catalog/       — Product/variant find-or-create
  consignors/    — Consignor CRUD, suspension
  email/         — 8 transactional email templates (Resend)
  inventory/     — Shopify inventory sync
  listings/      — mutations.server.ts (create/cancel), queries.server.ts (search/filter)
  orders/        — processing.server.ts, refunds.server.ts, balance.server.ts, queries.server.ts
  otp/           — OTP generation + verification
  portal/        — Auth, dashboard, sales, payouts, notifications, products
  shopify/       — Product sync, taxonomy, helpers
  submission/    — Approval, edit, lifecycle, bulk, consignor-actions
  webhooks/      — Webhook idempotency (WebhookEvent dedup)
```

Each folder has an `index.ts` barrel export. Import from the folder:
```typescript
import { createListing } from "~/services/listings";
import { processOrder } from "~/services/orders";
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

PostgreSQL case-insensitive text search across product title, styleId, brand, consignor name/email.

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
getConsignorBalance() — sum transactions minus paid payouts
```

Post-payout refund handling:

When a refund occurs after the consignor's payout has been marked "paid" (money already sent),
the system does NOT create a negative transaction. Instead it reassigns the item to a shop
consignor (Kulture Klash for footwear, Kulture Klothing for non-footwear) with 100% fee rate
so the marketplace can resell and recover the cost. A ReassignmentLog audit entry is created.

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

## Payouts Service

Handles per-item payout management. Admin selects specific sold-item transactions per consignor and bundles them into a payout.

Functions:

```
getPayoutsPageData()     — unpaid transactions grouped by consignor, recent payouts, summary stats
createPayout(consignorId, transactionIds) — validate ownership, prevent double-payout, create Payout + PayoutItems
markPaid(payoutId)       — update status to "paid"
cancelPayout(payoutId)   — delete payout + items (cascade), reject if paid
```

Payout lifecycle: `pending` → `invoiced` (future consignor portal) → `paid`

---

# Database Models

The system uses the following Prisma models:

```
Session          — Shopify OAuth sessions
Consignor        — Seller accounts with fee rate, tax status, store-owned flag
Product          — Catalog items (styleId, brand, category, imageUrl)
Variant          — Sizes with optional GTIN barcode
Listing          — Per-item inventory (1 row = 1 physical item, optional reassignment tracking)
Order            — Shopify orders with payment status tracking
OrderItem        — 1:1 mapping to allocated listings
Transaction      — Audit-grade financial records (sale/refund)
WebhookEvent     — Idempotent webhook processing
Payout           — Consignor payout records (pending → invoiced → paid)
PayoutItem       — Join table linking payouts to specific transactions
ReassignmentLog  — Audit trail for post-payout refund reassignments
OtpCode          — OTP codes for portal email login
StoreSection     — Physical store sections for listing organization
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

Statuses: `submitted`, `approved_awaiting_dropoff`, `active`, `paused`, `pending_sale`, `sold`, `cancelled`, `rejected`, `withdrawal_requested`, `pending_pickup`, `withdrawn`

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
