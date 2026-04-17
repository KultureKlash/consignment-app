# Production Deployment Checklist

Everything that needs to be done before going live. Items marked CRITICAL can compromise user accounts if skipped.

---

## 1. Environment Variables (CRITICAL)

Set these on your hosting platform (Fly.io, Railway, Vercel, etc.) — never commit them to git.

| Variable | Example | Why |
|----------|---------|-----|
| `COOKIE_SECRET` | `openssl rand -base64 32` | Signs portal session cookies. Without this, the app falls back to a hardcoded secret visible in source code — anyone could forge sessions. |
| `RESEND_API_KEY` | `re_xxxxx` (from resend.com) | Sends OTP login codes via email. Without this, codes only print to console (dev mode). |
| `RESEND_FROM_EMAIL` | `no-reply@yourdomain.com` | The "from" address on OTP emails. Use a verified domain in Resend. Default: `onboarding@resend.dev` (testing only). |
| `DATABASE_URL` | `postgresql://user:pass@host/db` | Production database (PostgreSQL). Dev uses SQLite. |
| `NODE_ENV` | `production` | Enables Secure cookie flag, disables dev fallbacks. |
| `SHOPIFY_API_KEY` | From Shopify Partners | Shopify app authentication. |
| `SHOPIFY_API_SECRET` | From Shopify Partners | Shopify app authentication. |
| `SHOPIFY_APP_URL` | `https://yourdomain.com` | Must be HTTPS in production. |

### How to generate COOKIE_SECRET

```bash
# Option 1: openssl
openssl rand -base64 32

# Option 2: node
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

---

## 2. Database Migration

Run Prisma migrations against the production database:

```bash
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

This applies all 23 migrations including the OtpCode table for email OTP login.

---

## 3. Security Headers (Already Implemented)

These are set in `app/entry.server.tsx` and activate automatically:

| Header | Scope | What it does |
|--------|-------|--------------|
| `X-Content-Type-Options: nosniff` | All routes | Prevents MIME sniffing |
| `Referrer-Policy: strict-origin-when-cross-origin` | All routes | Limits referrer leakage |
| `X-DNS-Prefetch-Control: off` | All routes | Prevents DNS prefetch leaks |
| `Permissions-Policy` | All routes | Blocks camera, mic, geolocation |
| `X-Frame-Options: DENY` | Portal only | Prevents clickjacking |
| `Strict-Transport-Security` | Portal only | Forces HTTPS (1 year) |
| `Content-Security-Policy` | Portal only | Restricts resource loading |

---

## 4. Security Hardening (Already Implemented)

All of the following are already in the code:

- **Cache-Control** on portal routes: `no-store, no-cache, must-revalidate` — prevents browser caching sensitive pages
- **Cross-Origin headers**: `CORP: same-origin`, `COOP: same-origin` — prevents cross-origin embedding
- **Server info removed**: `Server` and `X-Powered-By` headers deleted — hides tech stack
- **HSTS with preload**: `max-age=31536000; includeSubDomains; preload` — submit domain to https://hstspreload.org/ after deploy
- **Expanded Permissions-Policy**: accelerometer, camera, geolocation, gyroscope, magnetometer, microphone, payment, usb all blocked
- **SameSite=Strict** cookies: better CSRF protection (trade-off: external links to portal require re-login)
- **CSP base-uri and form-action**: both set to `'self'` — prevents form hijacking

---

## 5. Rate Limits (May Need Tuning)

Current limits in `app/lib/rate-limit.server.ts`:

| Limiter | Limit | Scope | Notes |
|---------|-------|-------|-------|
| Login | 10 / 15 min | Per IP | Prevents OTP brute force |
| Portal API | 60 / min | Per IP | Search autocomplete |
| Portal Forms | 20 / min | Per IP | Listing submissions |

**Known limitation:** A consignor submitting 1,050 listings would be throttled to ~20/min (~52 min total). Consider:
- Raising the form limit for authenticated sessions
- Adding bulk/CSV upload for high-volume consignors
- Exempting authenticated users from form rate limiting entirely

The rate limiter is **in-memory** — resets on server restart. For multi-instance production, swap to Redis.

---

## 6. Resend Email Setup

1. Create account at https://resend.com (free tier: 3,000 emails/month)
2. Verify your sending domain (DNS records)
3. Create an API key
4. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in production env vars
5. Test: log in to portal — you should receive a real OTP email

---

## 7. Domain & HTTPS

- Your production domain MUST use HTTPS (required for Secure cookies, HSTS, Shopify)
- Configure SSL certificate (most hosting platforms do this automatically)
- Ensure HTTP redirects to HTTPS at the infrastructure level (load balancer / CDN)

---

## 8. Monitoring & Maintenance

- **OTP cleanup:** Expired OTPs are cleaned opportunistically, but consider a cron job to run `cleanExpiredOtps()` daily
- **Rate limiter:** Currently in-memory — resets on server restart. For multi-instance production, consider Redis-based rate limiting
- **npm audit:** Run `npm audit` regularly to check for dependency vulnerabilities
- **Prisma:** Keep Prisma and dependencies updated for security patches

---

## 9. Data Migration (Old Laravel App → New App)

### Files needed from owner
1. **Fresh `localhost.sql`** — MySQL dump from phpMyAdmin on Hostgator (after owner syncs final orders)
2. **Fresh `shopify-export.csv`** — Shopify products CSV for barcode cross-verification
3. **Filled `store-owned-costs.csv`** — owner fills buy prices for 731 store-owned listings

### Store-owned accounts (storeOwned: true, feeRate: 0)

| Retailer ID | Name | Notes |
|---|---|---|
| 27 | Kulture Klash | Primary store account |
| 41 | Dalton Hardee | **Merged into Kulture Klothing (44)** — all inventory rolls to 44 |
| 44 | Kulture Klothing | Receives Dalton's inventory |
| 49 | SourceByKulture | |

### Merged accounts

```
MERGE_RETAILER = { "41": "44" }
```

Dalton Hardee (41) → Kulture Klothing (44). All of 41's listings become 44's.

### Email overrides

| Retailer ID | Override Email | Status |
|---|---|---|
| 36 | meryachkanou@gmail.com | Ready |
| 42 | shopkultureklash@gmail.com | Ready |
| 49 | support@shopkultureklash.com | Ready |
| 47 | laceup@placeholder.com | **PLACEHOLDER — need real email** |
| 50 | mike15@placeholder.com | **PLACEHOLDER — need real email** |

### Business consignors (get GST/QST invoiced on payouts)

Retailer IDs in `BUSINESS_CONSIGNORS` set: 13, 15, 16, 18, 23, 25, 30, 35, 46, 47, 50

All others are **individual** (no tax on payouts).

**CORRECTION:** Mansour Abassi (retailer ID 11) was previously included but is **individual**. Remove from set before prod migration.

### Province mapping (business consignors)

- **All Quebec (QC)** — GST (5%) + QST (9.975%) on payouts
- **Exception: Kevin Kalra (ID 25)** — Ontario (ON), GST (5%) only (no QST).

### Unpriced items (61 items — skipped during migration)

Documented in `docs/unpriced-items.md`. These have active inventory but no price in old app.
Need prices from owner before importing. Breakdown by consignor:

- Andrew Boutros: 15 items
- Kulture Klash (store): 10 items
- Dalton Hardee → Kulture Klothing: 5 items (Denim Tears tracksuits)
- Fabien Bueno: 4 items
- Yaroslav Bilodid: 4 items
- Marco Del Papa: 3 items
- Lace up: 3 items (Black Jordan Shoelaces)
- Michael Derderian: 2 items
- Kulture Klothing (store): 2 items (Chrome Hearts)
- Justin Buno: 1 item

### Store-owned costs (731/741 have no buy price)

Old app stored costs in `buy_price_all` JSON field, but most entries were empty.
Migration script now correctly parses `buy_price_all` (e.g. `{"100_1":"250","100_2":"310"}`).
CSV exported for owner to fill remaining costs manually: `store-owned-costs.csv`

### Categories

- Prod Shopify store already has categories assigned to products
- During migration: pull from Shopify API and map to our constants (Sneakers, Slides, Hoodies, etc.)
- `autoSuggest()` in `lib/categories/auto-suggest.ts` covers ~95% as fallback

### Per-item model

Old app: `product_retailer.quantity` can be > 1
New app: each Listing = 1 physical item. If quantity = 3, create 3 Listing rows.
Each row gets its own cost from `buy_price_all` JSON entries.

### Post-migration cleanup

- [ ] Delete `app/routes/app.seed-migration.tsx` (one-time route)
- [ ] Stop using "sync orders" in old Laravel app
- [ ] Old app stays on Hostgator as read-only backup

---

## 10. Pre-Launch Verification

- [ ] `COOKIE_SECRET` is set (not the dev fallback)
- [ ] `RESEND_API_KEY` is set and email delivery works
- [ ] `NODE_ENV=production` (enables Secure cookie flag)
- [ ] `DATABASE_URL` points to PostgreSQL (not SQLite)
- [ ] Prisma migrations applied (`npx prisma migrate deploy`)
- [ ] HTTPS is enforced
- [ ] Portal login works end-to-end (email → OTP → dashboard)
- [ ] Admin panel loads inside Shopify iframe
- [ ] Webhook (orders/fulfilled) fires correctly
- [ ] Emails send correctly (test OTP + item sold notification)
- [ ] Placeholder emails replaced (retailer 47 + 50)
- [ ] Mansour Abassi set to individual (not business)
- [x] Kevin Kalra's province confirmed (Ontario)
- [ ] Store-owned costs filled from CSV
- [ ] Unpriced items resolved with owner
- [ ] Shopify product/variant IDs verified against prod store
- [ ] Run `npm audit` — no critical vulnerabilities
- [ ] Delete migration route after final run
