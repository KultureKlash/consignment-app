# Consignment Marketplace Architecture

This document defines the architecture and structure of the Shopify consignment marketplace application.

It explains how the system is organized and where logic belongs.

This document must be read before modifying the codebase.

---

# Technology Stack

Backend

• Node.js
• TypeScript
• React Router
• Shopify Admin GraphQL API
• Prisma ORM
• SQLite (development)
• PostgreSQL (production)

Frontend

• React
• Shopify Polaris
• Shopify App Bridge

---

# Application Type

This project is a **Shopify embedded app**.

Shopify provides:

• storefront
• checkout
• order creation
• admin authentication

The application provides:

• product catalog
• consignor accounts
• listing engine
• order allocation
• financial ledger
• payouts

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

• search products
• create listings
• manage inventory
• view sales
• request payouts

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
Admin Dashboard
```

Admins manage:

• consignors
• listings
• catalog
• orders
• payouts

---

# System Architecture

The marketplace logic runs inside the application while Shopify acts only as the storefront.

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

The **database is the source of truth**.

Shopify mirrors:

• product data
• price
• inventory

---

# Project Structure

```
app/
  routes/
  services/
  db.server.ts
  shopify.server.ts

prisma/
  schema.prisma

docs/
  architecture.md
  features.md
  system_diagram.md
```

---

# Architecture Rule

The project follows a **service architecture**.

```
routes → services → prisma → database
```

Routes must **never contain business logic**.

Routes only:

• validate requests
• call services
• return responses

All marketplace logic lives inside **services**.

---

# Services Layer

Services contain the core marketplace logic.

```
app/services/
```

Current services will include:

```
catalog.server.ts
listings.server.ts
inventory.server.ts
orders.server.ts
payouts.server.ts
```

---

## Catalog Service

Handles product catalog operations.

Example responsibilities:

```
findProductByStyleId()
createProduct()
createVariant()
importStockXProduct()
```

Products are uniquely identified by **styleId**.

Example:

```
DD1391-100
```

---

## Listings Service

Handles consignor listings.

Example functions:

```
createListing()
updateListing()
deleteListing()
getListingsByVariant()
getListingsByConsignor()
```

Listings represent **actual marketplace inventory**.

---

## Inventory Service

Responsible for synchronizing Shopify inventory.

Rule:

```
Shopify inventory = SUM(listings.quantity)
```

Example:

Seller A → qty 2
Seller B → qty 1
Seller C → qty 3

Shopify inventory:

```
6
```

---

## Orders Service

Handles Shopify webhooks and listing allocation.

Example:

```
processOrderWebhook()
allocateListing()
deductListingQuantity()
```

Allocation rule:

```
1. Lowest price
2. FIFO tie breaker
```

---

## Payouts Service

Handles consignor balances and payouts.

Functions:

```
calculateBalance()
createPayout()
markPayoutPaid()
```

---

# Database Models

The system uses the following Prisma models.

```
Session
Consignor
Product
Variant
Listing
Order
OrderItem
Transaction
Payout
```

Marketplace data structure:

```
Product
↓
Variant (size)
↓
Listing (consignor inventory)
↓
OrderItem
↓
Transaction
↓
Payout
```

---

# Marketplace Rules

## Product Rule

Products are unique by `styleId`.

Example:

Nike Dunk Panda
styleId: DD1391-100

---

## Variant Rule

Variants represent sizes.

Example:

```
Size 8
Size 9
Size 10
```

Unique constraint:

```
(productId, size)
```

---

## Listing Rule

Multiple consignors may list the same variant.

Example:

Product: Nike Dunk Panda
Variant: Size 9

Listings:

Consignor A → qty 2
Consignor B → qty 1
Consignor C → qty 3

---

## Inventory Rule

Shopify inventory must equal:

```
SUM(listings.quantity)
```

Example:

```
2 + 1 + 3 = 6
```

---

# Current Development Goal

Before adding new features, the system must be stabilized.

### Step 1

Fix the test route:

```
/app/test-listing
```

This route must reliably trigger backend logic.

---

### Step 2

Confirm the `createListing()` service correctly:

• finds or creates Product
• finds or creates Variant
• creates Listing

---

### Step 3

Verify records appear correctly in **Prisma Studio**.

---

# Important Rule

Business logic must stay in **services**.

Never move marketplace logic into routes.

```
routes → services → prisma → database
```

---

# Next Phase

Once the listing engine works correctly, the next system to build is:

**Shopify Product Synchronization**

This will:

• create Shopify products from catalog
• create Shopify variants
• synchronize price
• synchronize inventory
