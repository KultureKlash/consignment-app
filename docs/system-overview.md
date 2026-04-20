# System Overview — Consignment Marketplace App

A Shopify embedded app that powers a consignment marketplace. The local database is the source of truth for all marketplace logic (listings, orders, financials). Shopify serves as the storefront — products, inventory, and prices are synced to Shopify, but Shopify never drives business logic.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React Router 7 (Remix-style file routing) + Vite |
| **Language** | TypeScript (ESM) |
| **Database** | Prisma ORM → PostgreSQL (Docker local dev, Neon cloud prod) |
| **Shopify** | @shopify/shopify-app-react-router, App Bridge React, Admin API (October 2025) |
| **UI** | Shopify Shadow DOM components (`s-page`, `s-button`, etc.) + Tailwind CSS |
| **Icons** | Lucide React |
| **Animation** | Framer Motion |
| **Testing** | Vitest (unit/integration), Playwright (e2e) |
| **Node** | >=20.19 <22 or >=22.12 |

### Key Dependencies

```
@shopify/shopify-app-react-router   — Shopify auth, sessions, webhooks
@shopify/shopify-app-session-storage-prisma — Session persistence in DB
@prisma/client                       — Database ORM
react-router                         — File-system routing (Remix-style)
vite                                 — Build tool + HMR
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Shopify Admin (iframe)                    │
│                                                                  │
│  ┌─────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Dashboard   │  │ Listings │  │  Orders  │  │  Consignors  │  │
│  │ app._index   │  │ app.list │  │ app.ord  │  │ app.consign  │  │
│  └──────┬───────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│         │               │             │                │          │
│         └───────────────┴──────┬──────┴────────────────┘          │
│                                │                                  │
└────────────────────────────────┼──────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     Routes Layer        │
                    │  (auth + call services) │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    Services Layer       │
                    │  (domain folders)       │
                    │                         │
                    │  catalog/ ← listings/ ──→ shopify/
                    │              │              │
                    │              ▼              ▼
                    │          inventory/    shopify/taxonomy
                    │              │
                    │  orders/ ────┘
                    │  webhooks/ (dedup wrapper)
                    │  submission/ (approve, edit, lifecycle)
                    │  portal/ (auth, dashboard, sales)
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    Prisma ORM           │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    PostgreSQL           │
                    └─────────────────────────┘
```

### Rules

1. **Routes** handle authentication + call services. No business logic in routes.
2. **Services** own one concern each. They call Prisma and other services.
3. **DB is source of truth**. Shopify mirrors data via best-effort sync.
4. Shopify sync failures don't block local operations (listings still created in DB).

---

## Database Client

**File:** `app/db.server.ts`

Singleton Prisma client — in development, the client is stored on `global` to survive Vite HMR reloads without creating connection leaks.

```typescript
const prisma = global.prismaGlobal ?? new PrismaClient();
export default prisma;
```

---

## Database Schema

14 models. All IDs are CUID strings unless noted. Nullable Shopify IDs allow records to exist before being synced to Shopify.

### Entity Relationship Diagram

```
Session (standalone — Shopify OAuth)

Consignor ─1:N──→ Listing ──N:1──→ Variant ──N:1──→ Product
    │                 │
    │                 └─1:N──→ OrderItem ──N:1──→ Order
    │                              │
    └──1:N──→ Transaction ──N:1────┘
    │
    └──1:N──→ Payout

WebhookEvent (standalone — deduplication)
```

### Models

#### Session
Shopify OAuth session storage. Managed by `@shopify/shopify-app-session-storage-prisma`.

| Field | Type | Notes |
|-------|------|-------|
| id | String @id | Shopify-assigned |
| shop | String | Shop domain |
| accessToken | String | Admin API token |
| isOnline | Boolean | Online vs offline token |
| expires | DateTime? | Token expiry |
| userId, firstName, lastName, email | Various? | Online session user info |
| refreshToken, refreshTokenExpires | Various? | Token refresh |

---

#### Consignor
Marketplace seller. Each consignor has a configurable fee rate (platform's cut).

| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| name | String | Display name |
| email | String @unique | Login/contact |
| feeRate | Float @default(0.15) | 0.15 = 15% fee, consignor keeps 85% |
| createdAt | DateTime | |

**Relations:** listings[], payouts[], transactions[]

---

#### Product
Catalog entry. Can be matched by `styleId` (footwear) or `title + brand` (other categories).

| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| title | String | Product name |
| brand | String? | Vendor |
| category | String? | Format: "Main > Sub" (e.g., "Footwear > Sneakers") |
| styleId | String? @unique | Footwear industry ID (e.g., "DZ5485-612") |
| description | String? | |
| shopifyProductId | String? @unique | Shopify GID, null until synced |
| createdAt | DateTime | |

**Relations:** variants[]

---

#### Variant
Size variant of a product. Composite unique on `(productId, size)`.

| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| productId | String | FK → Product |
| size | String | "10", "M", "OS", etc. |
| gtin | String? @unique | Barcode — auto-generated for non-footwear |
| shopifyVariantId | String? @unique | Shopify GID, null until synced |
| inventoryItemId | String? | Shopify inventory tracking ID |
| createdAt | DateTime | |

**Constraints:** `@@unique([productId, size])`
**Relations:** product, listings[]

---

#### Listing
**One row = one physical item.** No quantity field — this is the per-item model.

| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| consignorId | String | FK → Consignor (who's selling) |
| variantId | String | FK → Variant (what's being sold) |
| price | Float | Asking price |
| status | String @default("active") | `active` → `pending_sale` → `sold` or `cancelled` |
| createdAt | DateTime | |
| receivedAt | DateTime? | Item physically received |
| authenticatedAt | DateTime? | Item authenticated |
| listedAt | DateTime? | Published to storefront |
| soldAt | DateTime? | Allocated to order |
| withdrawnAt | DateTime? | Consignor withdrew item |

**Indexes:**
- `(variantId, status, price, createdAt)` — allocation queries (lowest price, FIFO)
- `(consignorId, status, createdAt)` — consignor dashboard

**Relations:** consignor, variant, orderItems[]

**Status Lifecycle:**
```
active ──(order placed)──→ pending_sale ──(payment captured)──→ sold
  │                              │
  └──(cancelled by admin)──→ cancelled    (refund)──→ active (restored)
```

---

#### Order
Customer order, linked to Shopify by `shopifyId`.

| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| shopifyId | String? @unique | Shopify order GID |
| total | Float | Sum of allocated listing prices |
| status | String @default("open") | `open`, `refunded`, `cancelled` |
| paymentStatus | String @default("pending") | `pending`, `paid`, `refunded`, `voided` |
| createdAt | DateTime | |

**Relations:** items[] (OrderItem)

---

#### OrderItem
Maps one listing to one order. Always 1:1 with a Listing (no quantity field).

| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| orderId | String | FK → Order |
| listingId | String | FK → Listing |
| price | Float | Snapshot of listing price at sale |
| status | String @default("sold") | `sold` or `refunded` |

**Relations:** order, listing, transactions[]

---

#### Transaction
**Immutable financial ledger.** All monetary values are frozen at creation time for audit-grade accuracy.

| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| consignorId | String | FK → Consignor |
| orderItemId | String? | FK → OrderItem (nullable for manual adjustments) |
| type | String | `sale`, `refund`, or `void` |
| salePrice | Float | Unit price at time of sale |
| feeRate | Float | Fee rate snapshot (e.g., 0.15) |
| grossAmount | Float | salePrice (per-item, always 1 unit) |
| feeAmount | Float | grossAmount × feeRate |
| consignorAmount | Float | grossAmount − feeAmount |
| amount | Float | **Net for balance calc.** Sales: +consignorAmount. Refunds: −consignorAmount |
| createdAt | DateTime | |

**Relations:** consignor, orderItem?

**Financial Calculation:**
```
grossAmount    = listing.price
feeRate        = consignor.feeRate (snapshot)
feeAmount      = grossAmount × feeRate
consignorAmount = grossAmount − feeAmount
amount         = ±consignorAmount (positive for sales, negative for refunds)
```

---

#### WebhookEvent
Ensures each Shopify webhook is processed exactly once (idempotency).

| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| shopifyEventId | String @unique | From `X-Shopify-Webhook-Id` header |
| topic | String | e.g., "orders/create" |
| shopifyObjectId | String | The Shopify resource ID |
| status | String @default("processing") | `processing`, `completed`, `failed` |
| error | String? | Error message if failed |
| processedAt | DateTime? | When processing completed |
| createdAt | DateTime | |

---

#### Payout
Tracks payments made to consignors.

| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | |
| consignorId | String | FK → Consignor |
| amount | Float | Payout amount |
| status | String @default("pending") | `pending`, `completed` |
| createdAt | DateTime | |

**Relations:** consignor

---

## Services

All services are organized into domain folders under `app/services/`. Each folder has an `index.ts` barrel export. Import from the folder: `import { createListing } from "~/services/listings"`.

### Service Call Graph

```
createListing()
  ├── findOrCreateProduct()        ← services/catalog/
  ├── findOrCreateVariant()        ← services/catalog/
  ├── generateBarcode()            ← lib/categories/
  ├── ensureShopifyProductAndVariant()  ← services/shopify/
  │     └── resolveShopifyTaxonomyId()  ← services/shopify/
  └── syncInventory()              ← services/inventory/

processOrder()
  ├── [allocate listings in transaction]
  ├── syncInventory() × N variants
  └── creditOrder() (if already paid)

cancelOrder() / refundOrder()
  ├── [reverse allocations in transaction]
  └── syncInventory() × N variants
```

### services/catalog/catalog.server.ts
**Purpose:** Database-only product/variant lookup and creation. No Shopify calls.

| Function | What it does |
|----------|-------------|
| `findOrCreateProduct({ styleId, title, brand, category })` | Lookup by styleId (footwear) or title+brand (other), create if missing |
| `findOrCreateVariant({ productId, size, gtin })` | Lookup by (productId, size) composite unique, create if missing, backfill GTIN |

- Case-insensitive search (handles SQLite sensitivity quirks)
- Footwear identified by presence of `styleId`

### services/listings/mutations.server.ts
**Purpose:** Create and cancel per-item listings.

**`createListing()` — 5-step flow:**

1. **Find/create product** → `catalog.findOrCreateProduct()`
2. **Find/create variant** → `catalog.findOrCreateVariant()`
3. **Auto-generate barcode** (non-footwear without GTIN) → `generateBarcode()` with 3 retry attempts for uniqueness
4. **Create N listing rows** in DB (each row = 1 physical item, `count` param controls how many)
5. **Shopify sync** (best-effort, wrapped in try/catch):
   - `ensureShopifyProductAndVariant()` → creates/updates Shopify product
   - `syncInventory()` → sets quantity + price on Shopify

**`cancelListing()`:** Sets status to `"cancelled"`, syncs inventory.

### services/listings/queries.server.ts
**Purpose:** Paginated, filtered listing search for the admin UI.

**`queryListings(filters)`** supports:
- Text search across: consignor name, product title, styleId, brand
- Filter by: status, category (hierarchical prefix match), consignor
- Sort by: date, price, status (asc/desc)
- Pagination with configurable page size (default 25)

### services/orders/ (processing.server.ts, refunds.server.ts, balance.server.ts)
**Purpose:** Full order lifecycle — allocation, payment, cancellation, refunds, balance.

| Function | What it does |
|----------|-------------|
| `processOrder()` | Allocate listings to order. Priority: lowest price first, FIFO tiebreak. Sets listings to `pending_sale`. |
| `creditOrder()` | Create sale Transactions when payment captured. Promotes `pending_sale` → `sold`. Idempotent. |
| `cancelOrder()` | Full reversal. Restores listings to `active`, creates void/refund Transactions. |
| `refundOrder()` | Partial or full refund. Reverse allocation: highest price first, newest first. Supports restock types. |
| `getConsignorBalance()` | `sum(transactions.amount) − sum(completed payouts.amount)` |

**Allocation (processOrder):**
```sql
-- Per-variant, find N active listings
ORDER BY price ASC, createdAt ASC   -- lowest price, oldest first (FIFO)
TAKE quantity
SET status = 'pending_sale', soldAt = now()
```

**Reverse Allocation (refundOrder):**
```sql
-- Opposite of allocation: refund the most expensive, newest items first
ORDER BY price DESC, createdAt DESC
```

All mutations happen inside `prisma.$transaction()`. Inventory sync happens after the transaction commits.

### services/shopify/products.server.ts
**Purpose:** Sync products and variants to Shopify Admin API.

**`ensureShopifyProductAndVariant()`:**

| Scenario | Action |
|----------|--------|
| Product not in Shopify | `productCreate` mutation → auto-creates first variant → `publishablePublish` to all channels → enable inventory tracking → sync barcode |
| Product exists, variant doesn't | `productVariantsBulkCreate` → add new size variant → enable tracking |
| Both exist | No-op (return early) |

**Key Shopify API detail (October 2025):** `ProductCreateInput` does NOT accept `variants` as input. You define `productOptions` with `values`, and Shopify auto-creates variants from the option values. Read them back from the response.

### services/shopify/taxonomy.server.ts
**Purpose:** Map local categories to Shopify taxonomy GIDs.

| Function | What it does |
|----------|-------------|
| `resolveShopifyTaxonomyId(admin, category)` | Parse "Main > Sub" → lookup in hardcoded map → query Shopify taxonomy API → cache result |
| `searchShopifyTaxonomy(admin, query)` | Search Shopify taxonomy (for UI dropdown in listing form) |

Uses process-level in-memory cache. Caches null results to avoid repeated lookups for unknown categories.

### services/inventory/inventory.server.ts
**Purpose:** Sync inventory count and price to Shopify.

**`syncInventory()` — Lowest-price-tier model:**

1. Find the lowest active listing price for the variant
2. Count all active listings at that price = `totalQuantity`
3. Set Shopify inventory quantity via `inventorySetQuantities`
4. If `totalQuantity === 0`:
   - If other variants exist on the product → **delete** the Shopify variant (clear IDs in DB)
   - If last variant → set price to $0 (can't delete the last one)
5. If `totalQuantity > 0` → set Shopify price to the lowest listing price

**Why lowest-price-tier?** Shopify shows one price per variant. We show the lowest available price and stock only the items at that price. Higher-priced listings become available after lower ones sell.

### services/webhooks/webhooks.server.ts
**Purpose:** Idempotent webhook processing via `WebhookEvent` table.

**`withWebhookDedup(shopifyEventId, topic, shopifyObjectId, handler)`:**

| Existing Event Status | Age | Action |
|----------------------|-----|--------|
| `completed` | Any | Skip (already processed) |
| `processing` | < 5 min | Skip (still running) |
| `processing` | ≥ 5 min | Retry (crash recovery) |
| `failed` | Any | Retry |
| None | — | Create record, run handler |

On success → status = `completed`. On error → status = `failed` + error message stored.

---

## Routes

### File-System Routing

React Router discovers routes from `app/routes/`. Dot notation = path segments.

```
app/routes/
├── app.tsx                         → Layout: /app/* (auth + nav shell)
│   ├── app._index.tsx              → /app (Dashboard)
│   ├── app.inventory.tsx           → /app/inventory (Create Listing form)
│   ├── app.listings.tsx            → /app/listings (Listings table + filters)
│   ├── app.orders.tsx              → /app/orders (Order list)
│   ├── app.orders_.$id.tsx         → /app/orders/:id (Order detail)
│   ├── app.consignors.tsx          → /app/consignors (Seller management)
│   ├── app.consignors_.$id.tsx     → /app/consignors/:id (Consignor detail)
│   ├── app.payouts.tsx             → /app/payouts (Payout management)
│   ├── app.sections.tsx            → /app/sections (Store sections)
│   ├── app.activity.tsx            → /app/activity (Full activity feed)
│   ├── app.api.products.tsx        → /app/api/products?q= (JSON: product search)
│   ├── app.api.brands.tsx          → /app/api/brands?q= (JSON: brand autocomplete)
│   ├── app.api.taxonomy.tsx        → /app/api/taxonomy?q= (JSON: Shopify categories)
│   ├── app.api.impersonate.tsx     → /app/api/impersonate (Portal impersonation)
│   └── app.api.invoice.$id.tsx     → /app/api/invoice/:id (Invoice PDF download)
├── portal.tsx                      → Layout: /portal/* (auth guard + sidebar)
│   ├── portal.dashboard.tsx        → /portal/dashboard
│   ├── portal.listings.tsx         → /portal/listings
│   ├── portal.listings_.new.tsx    → /portal/listings/new
│   ├── portal.payouts.tsx          → /portal/payouts
│   ├── portal.sales.tsx            → /portal/sales
│   └── portal.profile.tsx          → /portal/profile
├── portal_.login.tsx               → /portal/login (OTP email)
├── portal_.logout.tsx              → /portal/logout
├── portal_.impersonate.tsx         → /portal/impersonate (token accept)
├── health.tsx                      → /health (health check)
├── auth.$.tsx                      → OAuth callback (Shopify-managed)
├── webhooks.orders.create.tsx      → Webhook: orders/create
├── webhooks.orders.paid.tsx        → Webhook: orders/paid
├── webhooks.orders.fulfilled.tsx   → Webhook: orders/fulfilled
├── webhooks.orders.cancelled.tsx   → Webhook: orders/cancelled
├── webhooks.refunds.create.tsx     → Webhook: refunds/create
├── webhooks.app.uninstalled.tsx    → Webhook: app/uninstalled
└── webhooks.app.scopes_update.tsx  → Webhook: app/scopes_update
```

### Layout: app.tsx

Wraps all `/app/*` routes with:
1. `authenticate.admin(request)` — verifies Shopify session
2. `<AppProvider>` — Shopify App Bridge for embedded iframe
3. `<s-app-nav>` — Shadow DOM navigation sidebar

### Admin Panel Routes

Each route follows the same pattern:
- **loader:** Authenticate, query DB, return data
- **action:** Authenticate, validate form, call service, return result
- **component:** Render UI with `useLoaderData()` and `useFetcher()` for forms

| Route | Loader | Action |
|-------|--------|--------|
| **app._index** | Stats (active count, sold today, revenue, pending payouts, activity feed) | — |
| **app.inventory** | Consignors list, recent 10 listings, known brands | `intent: "create"` → `createListing()`, `intent: "cancel"` → `cancelListing()` |
| **app.listings** | `queryListings()` with URL search params, consignors | `intent: "cancel"` → `cancelListing()` |
| **app.consignors** | All consignors + `getConsignorBalance()` per consignor | — |
| **app.orders** | Last 50 orders with items, listings, transactions | — |

### API Routes (JSON)

Lightweight query endpoints used by UI components for autocomplete/search:

| Route | Query | Returns |
|-------|-------|---------|
| **app.api.products** | `?q=dunk` | `{ products: [{ id, styleId, title, brand, category, variants }] }` |
| **app.api.brands** | `?q=nik` | `{ brands: ["Nike", "Nik Thakkar", ...] }` |
| **app.api.taxonomy** | `?q=sneakers` | `{ categories: [{ id, fullName }] }` |

### Webhook Routes

All webhooks follow this pattern:
```typescript
export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  const { admin } = await unauthenticated.admin(shop);
  const webhookId = request.headers.get("X-Shopify-Webhook-Id");

  await withWebhookDedup(webhookId, topic, shopifyObjectId, async () => {
    // Call appropriate service function
  });

  return new Response();  // Always 200 (Shopify retries on non-200)
};
```

| Webhook | Service Call |
|---------|-------------|
| orders/create | `processOrder()` — allocate listings |
| orders/paid | `creditOrder()` — create sale transactions |
| orders/cancelled | `cancelOrder()` — restore listings |
| refunds/create | `refundOrder()` — partial/full refund |

**Important:** Webhook routes use `unauthenticated.admin(shop)` because they don't have session context — they authenticate via HMAC signature verification.

---

## Key Data Flows

### 1. Listing Creation

```
Admin creates listing in app
  │
  ▼
app.inventory.tsx (action, intent="create")
  │
  ▼
listings.createListing()
  ├── 1. catalog.findOrCreateProduct()  → DB: Product row
  ├── 2. catalog.findOrCreateVariant()  → DB: Variant row
  ├── 3. generateBarcode() [if needed]  → DB: Variant.gtin updated
  ├── 4. prisma.listing.create() × N    → DB: N Listing rows (per-item)
  └── 5. [try/catch — best effort]
        ├── shopify-products.ensureShopifyProductAndVariant()
        │     ├── productCreate or productVariantsBulkCreate
        │     ├── publishablePublish (all sales channels)
        │     └── inventoryItemUpdate (enable tracking)
        └── inventory.syncInventory()
              ├── inventorySetQuantities (set available count)
              └── productVariantsBulkUpdate (set price)
```

### 2. Order Lifecycle (Sale)

```
Customer buys on Shopify storefront
  │
  ▼
Shopify fires orders/create webhook
  │
  ▼
webhooks.orders.create.tsx
  → withWebhookDedup()
  → orders.processOrder()
       ├── For each lineItem:
       │     ├── Find variant by shopifyVariantId
       │     ├── Allocate N listings (lowest price, FIFO)
       │     ├── Listing.status: active → pending_sale
       │     └── Create OrderItem (1 per listing)
       ├── Set Order.total = sum of listing prices
       └── syncInventory() × affected variants
  │
  ▼
Shopify fires orders/paid webhook (may be same time or later)
  │
  ▼
webhooks.orders.paid.tsx
  → withWebhookDedup()
  → orders.creditOrder()
       ├── For each OrderItem (not yet credited):
       │     ├── Calculate: grossAmount, feeAmount, consignorAmount
       │     ├── Create Transaction (type="sale", amount=+consignorAmount)
       │     └── Listing.status: pending_sale → sold
       └── Order.paymentStatus: pending → paid
```

### 3. Refund Flow

```
Merchant issues refund in Shopify
  │
  ▼
Shopify fires refunds/create webhook
  │
  ▼
webhooks.refunds.create.tsx
  → withWebhookDedup()
  → orders.refundOrder()
       ├── Reverse allocation: highest price first, newest first
       ├── For each refunded item:
       │     ├── Listing.status: sold → active (if restocking)
       │     ├── OrderItem.status: sold → refunded
       │     └── Create Transaction (type="refund", amount=−consignorAmount)
       ├── Update Order.total (subtract refunded items)
       ├── If all items refunded → Order.status = "refunded"
       └── syncInventory() × affected variants
```

### 4. Cancellation Flow

```
Merchant cancels order in Shopify
  │
  ▼ (may fire refunds/create first, then orders/cancelled)
  │
  ▼
webhooks.orders.cancelled.tsx
  → withWebhookDedup()
  → orders.cancelOrder()
       ├── If already "refunded" (refund webhook beat us) → just set status="cancelled"
       ├── Otherwise, full reversal:
       │     ├── Restore all listings to "active"
       │     ├── Mark all OrderItems "refunded"
       │     ├── Create void/refund Transactions (if was paid)
       │     └── Order: status="cancelled", paymentStatus="refunded"/"voided"
       └── syncInventory() × affected variants
```

---

## Business Rules

### Per-Item Listing Model
Each `Listing` row represents exactly one physical item. There is no quantity field. To list 3 identical items, you create 3 Listing rows. This enables per-item tracking, per-item pricing, and precise allocation.

### Allocation Priority
When a customer buys, listings are allocated lowest price first, oldest first (FIFO tiebreak). This is a StockX-style model — the best price always sells first.

### Refund Priority
Refunds use reverse allocation: highest price first, newest first. This ensures the most recently allocated (and most expensive) items are refunded first.

### Lowest-Price-Tier Inventory
Shopify shows one price per variant. The app sets the Shopify price to the lowest active listing price and inventory count to the number of listings at that price. Higher-priced listings become visible after cheaper ones sell.

### Financial Ledger
Transactions are immutable snapshots. All fee calculations are frozen at creation time — if a consignor's fee rate changes later, existing transactions are unaffected.

```
Consignor Balance = sum(Transaction.amount) − sum(completed Payout.amount)
```

### Listing Status Visibility
Consignors see "sold" only when the order is paid and listing transitions from `pending_sale` → `sold`. They don't see allocations before payment.

---

## Lib Helpers

Organized into domain folders with barrel exports:

| Folder | Purpose |
|--------|---------|
| `lib/domain/` | Status constants: LISTING_STATUS, ORDER_STATUS, PAYOUT_STATUS, TRANSACTION_TYPE, CONSIGNOR_STATUS |
| `lib/finance/` | `calculateFee()`, `computeTax()` — canonical financial math |
| `lib/formatting/` | `fmt()` (currency), `generateCsv()`, `downloadStatement()` (PDF) |
| `lib/system/` | `logger`, `rateLimiter`, `env`, `sentry` — infrastructure |
| `lib/categories/` | Category constants, auto-suggest, barcode generation, helpers |

### Categories (`app/lib/categories/`)

| File | Exports |
|------|---------|
| `constants.ts` | `CATEGORIES` (4 mains: Footwear, Apparel, Accessories, Headwear with subs), `MAIN_CATEGORIES` |
| `helpers.ts` | `buildCategory(main, sub)` → "Main > Sub", `parseCategory(cat)` → `{main, sub}`, `isFootwear(cat)` |
| `barcode.ts` | `generateBarcode(brand, sub, size)` → `"FOG-HOD-L-A7X2KM9B"`, `abbreviateBrand()`, `abbreviateSubcategory()` |
| `auto-suggest.ts` | `autoSuggest(title)` → `{brand?, mainCategory?, subCategory?}` from keyword rules |

---

## Components

All in `app/components/`. Admin uses Tailwind CSS. Portal uses Tailwind with dark glass theme.

Components are organized into domain folders:
- `admin/shared/` — Reusable admin UI (StatsCard, CustomSelect, Dropdown, etc.)
- `admin/listings/` — ListingsTable, GroupRows, modals, ListingActionsContext
- `admin/create-listing/` — CreateListingForm + Context + sub-components
- `admin/payouts/` — Payout page sections
- `portal/shared/` — AppHeader, Sidebar, GlassSelect, DateRangePicker
- `portal/listings/` — ListingGroup, MobileDetailDrawer, InlinePrice, StatusTabs

---

## Testing

**Config:** `vitest.config.ts`

- Database: PostgreSQL test database (isolated from dev DB)
- `fileParallelism: false` — tests run sequentially (shared DB)
- `pool: "forks"` — separate process per test file

**Setup:** `tests/setup.ts`

```typescript
// beforeEach: clean all tables in FK-safe order
WebhookEvent → OrderItem → Transaction → Order → Listing → Variant → Product → Payout → Consignor

// Helper
createTestConsignor(overrides?) → Consignor with defaults
```

**Mock Admin:** `tests/helpers/mock-admin.ts` — Stubs the Shopify Admin API client for service-level tests. Returns canned responses for GraphQL mutations.

**Test Files:**
- `tests/listings.test.ts` — Listing creation, cancellation, per-item model
- `tests/orders.test.ts` — Allocation, refunds, cancellations, balance
- `tests/shopify-products.test.ts` — Product/variant Shopify sync
- `tests/shopify-taxonomy.test.ts` — Taxonomy resolution
- `tests/categories.test.ts` — Auto-suggestion rules
- `tests/fee-calc.test.ts` — Fee calculation edge cases
- `tests/security.test.ts` — Auth, rate limiting, HMAC cookies
- `tests/submission.test.ts` — Submission lifecycle (approve, reject, edit, withdraw)
- `tests/dashboard.test.ts` — Dashboard stats and activity feed
- `tests/tax.test.ts` — Province-based tax computation

---

## Dev Utilities

| Script | Purpose |
|--------|---------|
| `prisma/seed.ts` | Seeds 2 test consignors (Alice 15% fee, Bob 20% fee) |
| `prisma/reset-shopify-ids.ts` | Clears all shopifyProductId, shopifyVariantId, inventoryItemId |
| `prisma/reset-sessions.ts` | Deletes all sessions (force re-auth) |
| `prisma/reset-all.ts` | Wipes Listings → Variants → Products (respects FK order, keeps Consignors) |
| `scripts/reset-dev-store.ts` | Clears Shopify dev store data |

---

## Shopify Authentication

Configured in `app/shopify.server.ts`:

| Export | Usage |
|--------|-------|
| `authenticate.admin(request)` | Admin panel routes — verifies session from Shopify iframe |
| `authenticate.webhook(request)` | Webhook routes — HMAC signature verification |
| `unauthenticated.admin(shop)` | Get admin client without session (for webhook handlers) |

**Important:** Embedded app routes only have session context when the request comes from the Shopify Admin iframe. API routes (`app.api.*`) cannot be accessed directly from a browser — they need the Shopify session context.
