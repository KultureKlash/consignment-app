# Build Log

This file records all important architectural and development decisions for the marketplace platform.

Recording decisions prevents confusion later and allows the system design to remain consistent during development.

---

# 2026-03-10 — Project Initialization

## Decision: Build a new platform instead of upgrading Laravel

Reason:

The existing Laravel reseller platform works but is difficult to scale and maintain.
A modern architecture will improve performance, maintainability, and Shopify integration.

New system will be rebuilt using:

Node.js
Remix framework
React frontend
Shopify Polaris UI
Prisma ORM
PostgreSQL database

---

# 2026-03-10 — Shopify as Storefront Only

Decision:

Shopify will only act as the **storefront for customers**.

All marketplace logic will exist in the custom application.

This includes:

product catalog
seller listings
inventory ownership
order allocation
ledger accounting
payouts

Reason:

Shopify is not designed for multi-seller inventory systems.

---

# 2026-03-10 — StockX as Product Catalog Source

Decision:

Products will be created automatically using the StockX API instead of manually inside Shopify.

Flow:

StockX API → Our App → Shopify Product

Reason:

Ensures standardized sneaker catalog data.

---

# 2026-03-10 — Product Identification System

Decision:

Products are identified using **Style ID**.

Example:

DZ5485-612

Variants represent **sizes**.

Example:

Size 8
Size 9
Size 10

Optional identifier:

GTIN barcode (used for scanning).

---

# 2026-03-10 — Barcode Scanning Support

Decision:

The platform will support both:

Product search
Barcode scanning (GTIN)

Supported devices:

mobile camera
webcam
USB barcode scanners

Reason:

Speeds up listing creation for consignors.

---

# 2026-03-10 — Listing Based Marketplace

Decision:

Multiple consignors can sell the same product variant.

Listings contain:

consignor_id
variant_id
price
quantity
activated_at

Example:

Jordan 1 Chicago Size 10

Seller A → $430
Seller B → $450
Seller C → $470

Reason:

Allows marketplace competition between sellers.

---

# 2026-03-10 — Shopify Pricing Logic

Decision:

Shopify product variant price always equals the **lowest active listing price**.

Example:

Listings:

430
450
470

Shopify storefront price:

430

Reason:

Customers always see the best available price.

---

# 2026-03-10 — FIFO Sale Allocation

Decision:

Orders are assigned to sellers using FIFO rules.

Selection algorithm:

1. Lowest price
2. Earliest activated listing

Example:

Seller A → $430 → activated 10:00
Seller B → $430 → activated 11:00

Seller A sells first.

Reason:

Ensures fair seller priority.

---

# 2026-03-10 — Ledger Accounting Model

Decision:

All financial activity is stored in a ledger.

Ledger entry types:

Sale
Commission
Payout

Example ledger:

Sale: +430
Commission: −64.50
Consignor balance: +365.50

Reason:

Creates a full financial audit trail.

---

# 2026-03-10 — Development Strategy

The platform will be built in three phases.

Phase 1
Core marketplace engine

Phase 2
Functional dashboards

Phase 3
Final UI implementation using Lovable design
