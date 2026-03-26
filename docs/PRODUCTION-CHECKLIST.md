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

## 4. Improvements to Apply Before Production

### 4a. Add Cache-Control to Portal Routes (HIGH)

Sensitive portal pages (dashboard, payouts, listings) should not be cached by browsers.

**File:** `app/entry.server.tsx` — add inside the `if (isPortal)` block:

```typescript
responseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
responseHeaders.set("Pragma", "no-cache");
```

**Why:** Without this, a shared/public computer could show cached financial data to the next user.

---

### 4b. Add Cross-Origin Headers to Portal (MEDIUM)

**File:** `app/entry.server.tsx` — add inside the `if (isPortal)` block:

```typescript
responseHeaders.set("Cross-Origin-Resource-Policy", "same-origin");
responseHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
```

**Why:** Prevents cross-origin embedding and mitigates side-channel attacks (Spectre-like).

---

### 4c. Remove Server Info Disclosure (MEDIUM)

**File:** `app/entry.server.tsx` — add to the "all routes" section:

```typescript
responseHeaders.delete("Server");
responseHeaders.delete("X-Powered-By");
```

**Why:** Hides your tech stack (Node.js version, framework) from attackers scanning for known vulnerabilities.

---

### 4d. Add HSTS Preload (LOW)

**File:** `app/entry.server.tsx` — update HSTS header:

```typescript
// Current:
"max-age=31536000; includeSubDomains"
// Change to:
"max-age=31536000; includeSubDomains; preload"
```

Then submit your domain to https://hstspreload.org/ so browsers enforce HTTPS even on first visit.

---

### 4e. Expand Permissions-Policy (LOW)

**File:** `app/entry.server.tsx` — update to block more unused APIs:

```typescript
// Current:
"camera=(), microphone=(), geolocation=()"
// Change to:
"accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
```

---

### 4f. Upgrade SameSite Cookie to Strict (LOW)

**File:** `app/services/portal-auth.server.ts` — change:

```typescript
// Current:
"SameSite=Lax"
// Change to:
"SameSite=Strict"
```

**Why:** Better CSRF protection. Trade-off: if a consignor clicks a link to your portal from an external site, they'll need to log in again.

---

### 4g. Add CSP base-uri and form-action (LOW)

**File:** `app/entry.server.tsx` — append to CSP string:

```
; base-uri 'self'; form-action 'self'
```

**Why:** Prevents attackers from changing the base URL or submitting forms to external domains.

---

## 5. Resend Email Setup

1. Create account at https://resend.com (free tier: 3,000 emails/month)
2. Verify your sending domain (DNS records)
3. Create an API key
4. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in production env vars
5. Test: log in to portal — you should receive a real OTP email

---

## 6. Domain & HTTPS

- Your production domain MUST use HTTPS (required for Secure cookies, HSTS, Shopify)
- Configure SSL certificate (most hosting platforms do this automatically)
- Ensure HTTP redirects to HTTPS at the infrastructure level (load balancer / CDN)

---

## 7. Monitoring & Maintenance

- **OTP cleanup:** Expired OTPs are cleaned opportunistically, but consider a cron job to run `cleanExpiredOtps()` daily
- **Rate limiter:** Currently in-memory — resets on server restart. For multi-instance production, consider Redis-based rate limiting
- **npm audit:** Run `npm audit` regularly to check for dependency vulnerabilities
- **Prisma:** Keep Prisma and dependencies updated for security patches

---

## 8. Pre-Launch Verification

- [ ] `COOKIE_SECRET` is set (not the dev fallback)
- [ ] `RESEND_API_KEY` is set and email delivery works
- [ ] `NODE_ENV=production` (enables Secure cookie flag)
- [ ] `DATABASE_URL` points to PostgreSQL (not SQLite)
- [ ] Prisma migrations applied (`npx prisma migrate deploy`)
- [ ] HTTPS is enforced
- [ ] Portal login works end-to-end (email → OTP → dashboard)
- [ ] Admin panel loads inside Shopify iframe
- [ ] Run `npm audit` — no critical vulnerabilities
