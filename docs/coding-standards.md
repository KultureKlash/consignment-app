# Coding Standards & Architecture Rules

These rules are the law. Every pattern here exists because we found a real problem and fixed it. Follow them exactly.

---

## Architecture

```
routes → services → database / external APIs
```

Routes do ONLY: authentication, request validation, call service, return response. Zero business logic in routes.

Services own one concern. Services can call other services. Database is source of truth — Shopify mirrors data.

---

## File Size Limits

| Type | Max Lines |
|------|-----------|
| Service files | 500 |
| Route files | 200 |
| Components | 400 |
| Functions | 80 |

Split large files into folders with barrel re-exports. Split large functions into focused helpers.

---

## Functions

- **Max 80 lines per function.** If it does 5+ things, break it up. Each function does one thing.
- **Name by domain language, not technical action.** `checkinListing` not `activateListing`. Use what the store staff calls it.
- **No boolean positional parameters.** Use options objects:
  ```typescript
  // Bad: getConsignorDashboard(id, true)
  // Good: getConsignorDashboard(id, { storeOwned: true })
  ```
- **No god functions.** If a function fetches, validates, transforms, saves, AND syncs — split it.

---

## Comments

- **Never comment WHAT code does.** Only comment WHY.
  ```typescript
  // Bad: "// Fetch consignor" before prisma.consignor.findUnique
  // Bad: "// Create listing" before prisma.listing.create
  // Good: "// Re-fetch: ensureVariantBarcode may have written a new gtin"
  // Good: "// Idempotency: skip if already processed"
  ```
- **No emoji in comments.** Ever. No numbered steps (1️⃣ 2️⃣). No decorative emoji.
- **Section dividers are fine:** `// ── Admin: Approve ──`
- **If the code needs a comment to be understood, the code is too complex.** Simplify first.

---

## Logging

Use `logger` from `~/lib/logger.server` — **never bare `console.log` or `console.error`**.

```typescript
import { logger } from "~/lib/logger.server";

logger.info("Webhook received", { topic, shop });
logger.error("Shopify sync failed", { listingId, error: err.message });
```

- `logger.info` for successful operations and lifecycle events
- `logger.error` for failures — always include context object with relevant IDs
- No logging in components (server-side only)

---

## Constants & Magic Strings

- **Use status constants from `~/lib/domain`** — never raw status strings in service/component code:
  - `LISTING_STATUS` — submitted, approved_awaiting_dropoff, active, paused, pending_sale, sold, cancelled, rejected, withdrawal_requested, pending_pickup, withdrawn
  - `ORDER_STATUS` — open, refunded, cancelled, fulfilled
  - `PAYOUT_STATUS` — pending, invoiced, paid
  - `TRANSACTION_TYPE` — sale, refund, void
  - `CONSIGNOR_STATUS` — active, suspended
- If a string value is used in 2+ places, extract it to a constant.
- Status groups (`TERMINAL_STATUSES`, `ACTIVE_STATUSES`) live in `lib/domain/listing-statuses.ts`.

---

## Fee Calculation

- **Always use `calculateFee` from `~/lib/finance`** for fee/commission/consignor-amount math.
- Never inline fee arithmetic (`price * feeRate`) — the canonical function handles rounding consistently.
- Import: `import { calculateFee } from "~/lib/finance";`

---

## Components

- **Max 10 props per component.** Beyond that, use React Context.
- **Prop drilling max 2 levels.** If passing through 3+ levels, create a Context provider.
- **No inline `style={{}}` unless the value is dynamic** (runtime colors, computed positions). Use Tailwind classes from `admin.css`. Portal uses Tailwind — keep it that way.
- **Use `useCreateListing()` pattern** as the reference for Context-based form state management.

---

## Data Fetching

- **Never re-fetch a record passed as a parameter** unless it may have changed mid-function. If you must re-fetch, comment WHY.
  ```typescript
  // Good: re-fetch needed because ensureVariantBarcode updated gtin
  const freshVariant = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });
  ```
- **Use `select` when only IDs are needed** — don't fetch full objects for ID-only operations.
- **Use `include` strategically** — don't over-include relations you won't use.

---

## Security

These rules exist because we found and fixed real vulnerabilities:

- **Use `timingSafeEqual` for secret comparison** (OTP codes, tokens). Never `===` for secrets.
- **Use rightmost IP from x-forwarded-for** — first entry is client-controlled and spoofable.
- **Validate all numeric inputs with Zod schemas.** Never bare `parseFloat` for prices.
- **Always scope queries by authenticated user ID.** Every portal query must include `consignorId`. No IDOR.
- **Per-email rate limiting on OTP.** Max 3 requests per hour per email, on top of IP-based limits.
- **Generic error messages for auth.** Don't leak whether an email exists ("Invalid code or email" not "Account not found").

---

## Error Handling

```typescript
// Domain errors (user-facing): plain descriptive string
throw new Error("Cannot check in listing — status must be approved");

// System errors (dev-facing): use logger with context
logger.error("Shopify sync failed", { listingId, error: err.message });
```

- Don't silently swallow errors. Log them at minimum.
- Shopify sync failures are best-effort — log and continue. Use `safeSyncInventory()`.
- Use `findUniqueOrThrow` when the record must exist (throws clear error).

---

## TypeScript

- Avoid `any`. Use `unknown` or defined interfaces.
- Only use `eslint-disable` for `any` when the type genuinely can't be narrowed (Shopify GraphQL responses, jsPDF plugins).
- Use `as const` for constant objects.

---

## Testing

- **Every feature needs tests.** No exceptions.
- **Test before committing.** Run `npm run build && npx vitest run` before every commit.
- **Security-sensitive code needs explicit attack tests** (IDOR, rate limiting, input validation).
- **Use feature branches.** Never commit directly to main.

---

## Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| DB fields | snake_case | `shopify_product_id` |
| TS variables/functions | camelCase | `checkinListing` |
| Types/interfaces | PascalCase | `ListingStatus` |
| Constants | UPPER_SNAKE | `LISTING_STATUS` |
| Components | PascalCase | `ConsignorPicker` |
| Files | kebab-case or camelCase | `listing-statuses.ts` |

---

## Domain Folder Structure

One domain = one folder. Each folder has an `index.ts` barrel export.

**Rule:** Import from the folder, not individual files:
```typescript
// Good
import { createListing } from "~/services/listings";
import { LISTING_STATUS } from "~/lib/domain";
import { calculateFee } from "~/lib/finance";

// Bad
import { createListing } from "~/services/listings/mutations.server";
```

**Services naming convention:**
- `mutations.server.ts` — write operations (create, update, delete)
- `queries.server.ts` — read operations (search, list, detail)
- `[domain].server.ts` — single-file domains (e.g., `inventory.server.ts`)

---

## Project Structure

```
app/
  components/
    admin/
      shared/          — Reusable admin UI (StatsCard, CustomSelect, Dropdown, etc.)
      listings/        — ListingsTable, GroupRows, modals, ListingActionsContext, BulkActionBar
      create-listing/  — CreateListingForm + Context + sub-components
      payouts/         — Payout page sections (Unpaid, Pending, History)
      consignors/      — ConsignorsListPage, ConsignorDetailPage
      orders/          — OrdersListPage, OrderDetailPage
      sections/        — SectionsPage
    portal/
      shared/          — AppHeader, Sidebar, GlassSelect, DateRangePicker, InfoTip
      auth/            — LoginPage
      dashboard/       — DashboardPage
      listings/        — ListingGroup, MobileDetailDrawer, InlinePrice, StatusTabs
      payouts/         — PayoutsPage
      profile/         — ProfilePage
      sales/           — SalesPage
  services/            — Domain folders with barrel exports
    admin/             — Dashboard stats, listing-actions dispatcher, payouts
    catalog/           — Product/variant find-or-create
    consignors/        — CRUD, suspension
    email/             — 7 transactional email templates
    inventory/         — Shopify inventory sync
    listings/          — mutations + queries
    orders/            — processing, refunds, balance, queries
    otp/               — OTP generation/verification
    portal/            — Auth, dashboard, sales, payouts, notifications, products
    shopify/           — Product sync, taxonomy
    submission/        — Approval, edit, lifecycle, bulk, consignor-actions
    webhooks/          — Webhook idempotency
  lib/
    domain/            — Status constants (LISTING_STATUS, ORDER_STATUS, PAYOUT_STATUS, etc.)
    finance/           — Fee calculation, tax computation
    formatting/        — CSV, currency, PDF
    system/            — Logger, rate-limit, env, sentry
    categories/        — Category constants, auto-suggest, barcode generation
    (root)             — Validation, size-order, image-processing, deriveProductMetafields
  routes/              — Flat dot-notation (app.*, portal.*, webhooks.*, health)
```

---

## What NOT to Do (Lessons Learned)

These patterns were found and removed. Don't reintroduce them:

1. **No emoji in code** — screams AI-generated
2. **No "what" comments** — if the comment restates the next line, delete it
3. **No console.log** — use the structured logger
4. **No 20+ prop components** — use Context
5. **No magic status strings** — use LISTING_STATUS constants
6. **No boolean positional params** — use options objects
7. **No god functions** — max 80 lines, single responsibility
8. **No re-fetching passed parameters** — unless data changed (and comment why)
9. **No `===` for secrets** — use timingSafeEqual
10. **No first-IP from x-forwarded-for** — use rightmost (last)
