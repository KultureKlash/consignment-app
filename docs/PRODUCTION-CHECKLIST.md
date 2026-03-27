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

## 9. Pre-Launch Verification

- [ ] `COOKIE_SECRET` is set (not the dev fallback)
- [ ] `RESEND_API_KEY` is set and email delivery works
- [ ] `NODE_ENV=production` (enables Secure cookie flag)
- [ ] `DATABASE_URL` points to PostgreSQL (not SQLite)
- [ ] Prisma migrations applied (`npx prisma migrate deploy`)
- [ ] HTTPS is enforced
- [ ] Portal login works end-to-end (email → OTP → dashboard)
- [ ] Admin panel loads inside Shopify iframe
- [ ] Run `npm audit` — no critical vulnerabilities
