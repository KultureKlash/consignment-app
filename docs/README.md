# Konsign — Consignment Marketplace App

Shopify embedded app for managing a multi-seller consignment marketplace. Built with Remix (React Router 7), Prisma, PostgreSQL, and Tailwind CSS.

---

## Quick Start (New Computer Setup)

### Prerequisites

Install these first:

1. **Node.js** (v20+) — [nodejs.org](https://nodejs.org)
2. **Docker Desktop** — [docker.com](https://www.docker.com/products/docker-desktop)
3. **Shopify CLI** — `npm install -g @shopify/cli`
4. **Git** — [git-scm.com](https://git-scm.com)

### Step 1: Clone the repo

```bash
git clone https://github.com/KultureKlash/consignment-app.git
cd consignment-app
```

### Step 2: Install dependencies

```bash
npm install
```

### Step 3: Start the database

```bash
# Start PostgreSQL in Docker (runs on port 5432)
docker run -d \
  --name konsign-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=konsign \
  -p 5432:5432 \
  postgres:16

# Create the test database (for running tests without wiping dev data)
docker exec konsign-db psql -U postgres -c "CREATE DATABASE konsign_test;"
```

### Step 4: Create the `.env` file

Create a file called `.env` in the project root:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/konsign"
NODE_ENV="development"
COOKIE_SECRET="dev-cookie-secret-change-in-prod"
SHOPIFY_API_KEY="your-shopify-api-key"
SHOPIFY_API_SECRET="your-shopify-api-secret"
SHOPIFY_APP_URL="https://your-cloudflare-tunnel.trycloudflare.com"
SCOPES="write_products,read_products,write_inventory,read_inventory"
PORT=3000
```

Get the Shopify API key/secret from [Shopify Partners](https://partners.shopify.com) → Apps → Kulture Konsign → API credentials.

Optional (not needed for dev):
```env
RESEND_API_KEY="re_xxxxx"
RESEND_FROM_EMAIL="no-reply@konsign.shopkultureklash.com"
SENTRY_DSN="https://xxxxx@sentry.io/xxxxx"
```

### Step 5: Push the database schema

```bash
npx prisma db push
npx prisma generate
```

### Step 6: Start the dev server

```bash
npm run dev
```

This starts the Shopify dev tunnel + Remix dev server. The app will be available in your Shopify admin under Apps → Kulture Konsign.

### Step 7: Verify

- Open Shopify admin → Apps → Kulture Konsign → should load the dashboard
- Visit the portal URL shown in the terminal → consignor login page

---

## Running Tests

```bash
# Run all 391 tests
npx vitest run

# Run a specific test file
npx vitest run tests/orders.test.ts

# Watch mode
npx vitest
```

Tests use a separate database (`konsign_test`) to avoid wiping dev data.

---

## Database Management

```bash
# Start the database (if stopped)
docker start konsign-db

# Stop the database
docker stop konsign-db

# Reset dev database (wipes all data)
npx prisma db push --force-reset

# View database in browser
npx prisma studio
```

---

## Project Structure

```
app/
  routes/              — Thin wrappers (auth + service call + render)
  services/            — Business logic organized by domain
    orders/            — Order processing, refunds, balance
    listings/          — Create, delete, restore, query listings
    catalog/           — Product/variant CRUD + search
    consignors/        — Consignor management
    inventory/         — Shopify inventory sync
    email/             — Transactional emails (Resend)
    admin/             — Admin dashboard, payouts, listing actions
    portal/            — Consignor auth, dashboard, sales, payouts
    shopify/           — Shopify GraphQL API integration
    submission/        — Listing lifecycle (approve, reject, checkin)
  components/
    admin/             — Admin UI (Shopify embedded)
    portal/            — Consignor portal UI (dark theme)
  lib/                 — Pure utilities
    domain/            — Status constants
    finance/           — Fee calculation, tax
    formatting/        — Currency, CSV, PDF
    system/            — Logger, Sentry, rate limiting
    categories/        — Category constants + auto-suggest
docs/                  — Architecture, coding standards, checklists
tests/                 — 391 Vitest tests
prisma/
  schema.prisma        — Database schema (14 models)
```

---

## Key Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start dev server (Shopify tunnel + Remix) |
| `npm run build` | Build for production |
| `npx vitest run` | Run all tests |
| `npx prisma studio` | Open database browser |
| `npx prisma db push` | Push schema changes to database |
| `npx prisma generate` | Regenerate Prisma client after schema changes |

---

## Tech Stack

- **Framework:** Remix (React Router 7)
- **Database:** PostgreSQL (Docker local, Neon cloud prod)
- **ORM:** Prisma
- **UI:** Tailwind CSS v4 + Framer Motion
- **Hosting:** Fly.io (Toronto region)
- **Email:** Resend
- **Error tracking:** Sentry
- **Auth:** HMAC-SHA256 signed cookies (portal), Shopify App Bridge (admin)

---

## Documentation

| File | What it covers |
|------|---------------|
| `docs/APP-INDEX.md` | Full file reference — every service, route, component |
| `docs/architecture.md` | System design + folder structure |
| `docs/coding-standards.md` | Rules for code quality |
| `docs/FEATURES.md` | All implemented features |
| `docs/PRODUCTION-CHECKLIST.md` | Deploy checklist + migration data |
| `docs/system-overview.md` | Deep technical reference |

---

## Troubleshooting

**Docker database won't start:**
```bash
docker rm konsign-db  # Remove old container
# Then re-run the docker run command from Step 3
```

**Prisma generate fails (EPERM on Windows):**
```bash
# Stop dev server first, then:
rm -f node_modules/.prisma/client/query_engine-windows.dll.node
npx prisma generate
```

**Tests fail with database errors:**
```bash
# Push schema to test database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/konsign_test" npx prisma db push
```

**Shopify app doesn't load in admin:**
- Make sure `npm run dev` is running (creates the tunnel)
- Check that the app URL in Shopify Partners matches the tunnel URL
- Try `npm run dev -- --reset` to re-link the app
