# CLAUDE.md — Consignment App

This file auto-loads into every Claude session. Read it before doing anything.

It is short on purpose. The full picture lives in `docs/`. This file is the **map** to that picture and the **non-negotiable rules**.

---

## What this app is

Shopify embedded app powering a consignment marketplace (Kulture Klash). Shopify is storefront only. All marketplace logic — listings, orders, financials, payouts, consignor accounts — lives here.

Stack: React Router 7 + TypeScript + Prisma + PostgreSQL (Docker local, Neon prod). Hosted on Fly.io. Tailwind for both admin and portal.

---

## Where to look

| Need | File |
|------|------|
| Architecture, folder map, service responsibilities | [docs/architecture.md](docs/architecture.md) |
| Deep system walkthrough, data flows, schema | [docs/system-overview.md](docs/system-overview.md) |
| Coding rules (file sizes, naming, security, comments) | [docs/coding-standards.md](docs/coding-standards.md) |
| Feature inventory | [docs/FEATURES.md](docs/FEATURES.md) |
| Production checklist | [docs/PRODUCTION-CHECKLIST.md](docs/PRODUCTION-CHECKLIST.md) |
| Fly.io deploy guide | [docs/DEPLOY-FLY.md](docs/DEPLOY-FLY.md) |
| Index of every doc | [docs/APP-INDEX.md](docs/APP-INDEX.md) |

If you change architecture or rules, update the relevant doc in the **same PR** as the code.

---

## Non-negotiable rules

### Architecture
```
routes → services → prisma → database
```
Routes do auth + call a service. Zero business logic in routes. Services own one concern. DB is source of truth. Shopify mirrors data.

### Per-item listing model
Each `Listing` row = one physical item. No quantity field. Listing 3 items at $200 creates 3 Listing rows.

### Allocation
Sales: lowest price first, FIFO tiebreak. Refunds: highest price, newest first.

### Inventory sync
Shopify shows the **lowest active price** for a variant. Shopify quantity = count of active listings at that lowest price.

### Constants over magic strings
Use `LISTING_STATUS`, `ORDER_STATUS`, `PAYOUT_STATUS`, `TRANSACTION_TYPE`, `CONSIGNOR_STATUS` from `~/lib/domain`. Never inline status strings.

### Finance
Use `calculateFee` from `~/lib/finance`. Never inline `price * feeRate`.

### Imports
Import from the folder, not the file:
```typescript
import { createListing } from "~/services/listings";       // good
import { createListing } from "~/services/listings/mutations.server"; // bad
```

---

## Working rules (how I want you to work)

1. **Tests before commit.** Run `npm run build && npx vitest run` before every commit. Currently ~418 tests passing.
2. **Feature branches only.** Never commit directly to `main`.
3. **Mobile responsive.** All portal pages must work on mobile.
4. **Read first.** Search ALL files before claiming something doesn't exist. Don't assume from memory.
5. **No emoji in code.** Anywhere. Ever.
6. **No "what" comments.** Only WHY. If code needs a comment to be understood, simplify the code.
7. **No `console.log`.** Use `logger` from `~/lib/logger.server`.
8. **Structured logger only** for server code. No bare `console`.
9. **`timingSafeEqual` for secret comparison.** Never `===`.
10. **Scope all portal queries by `consignorId`.** No IDOR.

---

## Memory drift notice

A separate per-user `MEMORY.md` exists outside this repo and may go stale. **This file + `docs/` are the source of truth.** If memory disagrees with what's here or in the code, trust the repo.

Before recommending a function, file, or flag from memory: grep for it first.

---

## End-of-session checklist

Before ending a session, ask yourself:
- Did I add/rename/remove a service, route, or folder? → update `docs/architecture.md`
- Did I change a business rule, status, or financial calc? → update `docs/coding-standards.md` and/or this file
- Did I add a new doc-worthy pattern? → put it in `docs/`, link it from `docs/APP-INDEX.md`
- Did the test count change meaningfully? → update the number in this file

The Stop hook will remind you.
