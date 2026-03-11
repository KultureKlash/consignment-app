# Coding Standards & Architecture Rules

This document defines coding standards and architectural rules for the marketplace application.

The goal is to maintain **consistent, scalable, and maintainable code**.

---

# Architecture Rules

The project follows a strict service-based architecture.

Routes should not contain business logic.

```
routes → services → database / external APIs
```

Routes are responsible only for:

• authentication
• request validation
• calling services
• returning responses

Business logic must exist inside the `services` layer.

---

# Service Layer Structure

Services contain the core marketplace logic.

Examples:

```
services/
  catalog.server.ts
  listings.server.ts
  inventory.server.ts
  orders.server.ts
  payouts.server.ts
```

Responsibilities:

catalog → product catalog logic
listings → consignor inventory
inventory → Shopify inventory synchronization
orders → order allocation and processing
payouts → financial payouts and balances

Services may call other services when necessary.

---

# Database Rules

Prisma models represent the **source of truth** for the marketplace.

Key principles:

• Shopify data must not be treated as the source of truth
• Inventory exists in the database
• Shopify mirrors inventory for storefront display

All database writes must happen through Prisma.

---

# Shopify Integration Rules

Shopify is used as a storefront and checkout system.

The application is responsible for:

• catalog management
• listing management
• inventory aggregation
• price synchronization
• order allocation

Shopify product data must always be linked using stored IDs:

```
shopify_product_id
shopify_variant_id
```

---

# Inventory Rules

Marketplace inventory comes from listings.

```
Shopify Inventory = SUM(listings.quantity)
```

Inventory updates must be triggered when:

• listings are created
• listing quantities change
• orders allocate listings
• orders are cancelled or refunded

---

# Order Allocation Rules

Orders are allocated using the following priority:

1. Lowest listing price
2. FIFO tie breaker using `activated_at`

Allocation must occur inside a **database transaction** to prevent overselling.

---

# Code Organization

Files should remain small and focused.

Recommended limits:

• service files < 500 lines
• route files < 200 lines

Large logic blocks should be split into helper functions.

---

# Naming Conventions

Use consistent naming patterns.

Database fields:

```
snake_case
```

TypeScript variables and functions:

```
camelCase
```

Classes and types:

```
PascalCase
```

---

# Error Handling

Errors should not be silently ignored.

Use structured error handling:

• service-level error handling
• meaningful error messages
• logging when appropriate

---

# TypeScript Rules

Avoid using `any`.

Use explicit types whenever possible.

Prefer:

```
unknown
```

or defined interfaces.

---

# Code Readability

Code should be written for clarity.

Prefer:

• descriptive variable names
• small functions
• clear separation of responsibilities

Avoid deeply nested logic when possible.

---

# Future Development

When adding new features:

1. Determine which service is responsible
2. Implement logic inside the service
3. Expose functionality via routes if needed
4. Update documentation when architecture changes

Maintaining consistency is critical for long-term scalability.
