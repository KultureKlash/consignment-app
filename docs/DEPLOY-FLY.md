# Deploying Konsign to Fly.io (with the existing dev store)

This is the first-time deploy runbook. After it works once, future deploys are
just `fly deploy`.

You'll point the production app at your existing `kulture-konsign-dev.myshopify.com`
store — same DB schema, same shopify partners app, just a stable URL instead of
the cloudflare tunnel.

---

## 0. Prerequisites (one-time)

- **Fly.io account** + CLI installed: https://fly.io/docs/hands-on/install-flyctl/
- **Neon account** for managed Postgres: https://neon.tech (free tier is enough)
- **Resend account + verified sending domain** for transactional email (already in `.env.example`)
- Sign in to Fly: `fly auth login`

---

## 1. Provision the Postgres DB

In Neon dashboard:
1. Create a new project (region: closest to Fly region, e.g. AWS Montreal `ca-central-1`)
2. Copy the **pooled** connection string (looks like `postgresql://user:pwd@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`)
3. Save it — you'll set it as `DATABASE_URL` below

---

## 2. Create the Fly app

```bash
fly launch --no-deploy --name konsign --region yul --copy-config
```

- `--no-deploy` — don't deploy yet, we still need to set secrets
- `--name konsign` — your app name (must be globally unique on Fly; pick something
  else if taken)
- `--region yul` — Montreal (closest to your store + the Neon DB)
- `--copy-config` — uses the existing `fly.toml`

If `konsign` is taken, pick another name and update `fly.toml`'s `app = "..."` line.

---

## 3. Set production secrets

```bash
fly secrets set \
  DATABASE_URL="postgresql://user:pwd@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require" \
  COOKIE_SECRET="$(openssl rand -hex 32)" \
  SHOPIFY_API_KEY="<from-shopify-partners>" \
  SHOPIFY_API_SECRET="<from-shopify-partners>" \
  SHOPIFY_APP_URL="https://konsign.fly.dev" \
  SCOPES="write_products,read_products,write_inventory,read_inventory" \
  RESEND_API_KEY="<from-resend>" \
  RESEND_FROM_EMAIL="no-reply@konsign.shopkultureklash.com" \
  SENTRY_DSN="<optional-from-sentry>"
```

Notes:
- `SHOPIFY_APP_URL` is the URL Fly will give you — usually `https://<app-name>.fly.dev`
- `COOKIE_SECRET` must be a strong random string (the `openssl rand -hex 32` command
  generates one). Save it somewhere safe — losing it logs everyone out
- Get `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` from
  [Shopify Partners](https://partners.shopify.com) → Apps → Kulture Konsign → API credentials

---

## 4. Deploy

```bash
fly deploy
```

This builds the Docker image and runs `prisma migrate deploy` on startup so the
Neon DB gets schema'd up automatically.

When it's done:
```bash
fly logs       # tail logs
fly status     # see machine status
fly open       # open the app URL in browser
```

The app should respond on `https://konsign.fly.dev/health` with `{ ok: true }`.

---

## 5. Point the Shopify app at the new URL

In `shopify.app.consignment-app.toml` (or whichever `.toml` your dev points at):

```toml
application_url = "https://konsign.fly.dev"

[auth]
  redirect_urls = [
    "https://konsign.fly.dev/auth/callback",
    "https://konsign.fly.dev/auth/shopify/callback",
    "https://konsign.fly.dev/api/auth/callback",
  ]
```

Then push the config to Shopify:
```bash
npm run config:link    # if not already linked
npm run deploy         # pushes app config + extensions to Shopify
```

This updates the URLs in Shopify Partners. Your dev store will reinstall against
the new URL on next visit.

---

## 6. Re-install on the dev store

1. In Shopify admin → Apps → Kulture Konsign → click it
2. You'll get an OAuth re-install prompt (because the URL changed)
3. Approve → app loads from `konsign.fly.dev` instead of the cloudflare tunnel

The DB on Neon starts empty, so you'll need to seed consignors / re-add listings
for testing — OR run the migration script (see `PRODUCTION-CHECKLIST.md` section 9)
to import from the Laravel dump.

---

## 7. One-time backfills

After the first deploy, run these once via the embedded admin app:
- `/app/backfill-metafields` → click both buttons (sync metafields + fix product types)

---

## 8. Subsequent deploys

After this initial setup:
```bash
git push origin main    # if you use CI/CD
# or just:
fly deploy              # local CLI
```

That's it. Migrations run automatically on each deploy via `prisma migrate deploy`
inside the Docker entrypoint.

---

## Troubleshooting

**App shows "Application Error" / 502:**
- `fly logs` — look for env validation failure or Prisma connection error
- Check that `DATABASE_URL` is the **pooled** Neon URL (the non-pooled one runs
  out of connections fast)

**Health check failing:**
- Verify `/health` returns 200: `curl https://konsign.fly.dev/health`
- If migrations are still running on first boot, give it 30-60 seconds

**Shopify won't load the app:**
- Verify `SHOPIFY_APP_URL` matches the Fly URL exactly (no trailing slash)
- Re-run `npm run deploy` to push the URL update to Shopify Partners
- Hard-refresh the admin page; sometimes Shopify caches the old URL

**"Cannot find query_engine-windows.dll.node":**
- That's a Windows-only dev issue, doesn't apply to Fly (Linux container)

**Cookie session keeps logging out:**
- `COOKIE_SECRET` got rotated unintentionally. Don't change it after launch
- If you must rotate, all consignor portal sessions invalidate (they re-OTP)
