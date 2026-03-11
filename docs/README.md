# Consignment Marketplace App

This project is a **multi-seller consignment marketplace built on Shopify**.

Shopify is used as the **storefront and checkout**, while the application manages all marketplace logic including:

• product catalog
• consignor listings
• inventory aggregation
• order allocation
• financial ledger
• payouts

The system behaves similarly to **StockX-style marketplaces** where multiple sellers can list the same product variant.

---

# IMPORTANT

Before modifying code, **always read the documentation in `/docs`**.

These files define the system architecture, coding rules, and development roadmap.

AI coding tools (Claude, Copilot, ChatGPT) should **review these documents first before generating code**.

---

# Documentation

All project documentation is located in:

```
/docs
```

---

## Architecture

These files explain how the system is designed.

`/docs/architecture.md`
Main system architecture and project structure.

`/docs/system-diagram.md`
Visual overview of the marketplace architecture.

`/docs/reseller-system-architecture.md`
Detailed explanation of marketplace logic including listings, orders, inventory, and payouts.

---

## Development Rules

`/docs/coding-standards.md`

Defines coding conventions and architectural rules.

Examples:

• business logic must stay in services
• routes must remain thin
• database access goes through Prisma
• maintain consistent service structure

---

## Feature Planning

`/docs/features.md`

Roadmap of all planned marketplace features grouped by development phase.

---

## Development History

`/docs/build-log.md`

Chronological development log describing major milestones and changes.

---

# Core Architecture Rule

This project follows a **service-based architecture**.

```
routes → services → prisma → database
```

Routes must **never contain business logic**.

Routes are responsible for:

• request validation
• authentication
• calling services
• returning responses

All marketplace logic lives in:

```
app/services/
```

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
  system-diagram.md
  reseller-system-architecture.md
  coding-standards.md
  features.md
  build-log.md
```

---

# Tech Stack

Backend

• Node.js
• TypeScript
• React Router (Shopify template)
• Prisma ORM
• SQLite (development database)
• PostgreSQL (production database)
• Shopify Admin GraphQL API

Frontend

• React
• Shopify Polaris
• Shopify App Bridge

Integrations

• Shopify Storefront
• StockX Product Catalog API
• GTIN barcode scanning

---

# Marketplace Data Model

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

# Inventory Rule

Shopify inventory must equal:

```
SUM(listings.quantity)
```

Example:

Consignor A → qty 2
Consignor B → qty 1
Consignor C → qty 3

Shopify inventory:

```
6
```

---

# Development Workflow

1. Read `/docs/architecture.md`
2. Confirm feature status in `/docs/features.md`
3. Implement logic inside **services**
4. Expose functionality through **routes**
5. Update documentation if architecture changes
