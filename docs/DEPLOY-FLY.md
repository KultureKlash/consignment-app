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
  CRON_SECRET="$(openssl rand -hex 32)" \
  SENTRY_DSN="<optional-from-sentry>"
```

Notes:
- `SHOPIFY_APP_URL` is the URL Fly will give you — usually `https://<app-name>.fly.dev`
- `COOKIE_SECRET` must be a strong random string (the `openssl rand -hex 32` command
  generates one). Save it somewhere safe — losing it logs everyone out
- Get `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` from
  [Shopify Partners](https://partners.shopify.com) → Apps → Kulture Konsign → API credentials
- **`CRON_SECRET` is required.** `validateEnv()` fails the boot without it. It gates
  `/cron/retention`, which erases customer PII past the 90-day window; a missing secret
  makes that route return 404 and retention silently never happens
- `SENTRY_DSN` stays optional, but the app now warns at boot without it, because error
  reporting is then entirely off

---

## 3b. Schedule the PII retention job

> **App name.** This guide writes `konsign.fly.dev`, but `fly.toml` currently says
> `app = "consignment-app-cp9fjq"` — Fly assigned that when `konsign` turned out to be
> taken. The live host is therefore `consignment-app-cp9fjq.fly.dev`. The commands below
> read the name out of `fly.toml` so they stay correct either way; substitute your own
> if you rename the app.

### What it does

`/cron/retention` nulls `WebhookEvent.rawPayload` on rows older than **90 days** and
keeps the row. That is the PII control; see the retention section of
[system-overview.md](system-overview.md). It is idempotent, so a missed day costs
nothing and a double-run is harmless.

Two windows apply to `WebhookEvent` and they are different controls:

| Window | Mechanism | What happens |
|---|---|---|
| 90 days | `/cron/retention` (daily) | `rawPayload` nulled — PII gone, row kept for dedup and audit |
| 365 days | `/app/cleanup` (manual, admin) | The row itself deleted — audit horizon |

### Set the secret

```bash
fly secrets set CRON_SECRET="$(openssl rand -hex 32)"
```

Keep a copy. Setting it triggers a rolling restart, which is expected.

### Create the scheduled machine

Fly runs a scheduled machine on its own and exits; app secrets are injected into it
automatically, so `CRON_SECRET` does **not** go on the command line.

```bash
APP="$(awk -F'"' '/^app =/{print $2}' fly.toml)"

fly machine run curlimages/curl:latest \
  --app "$APP" \
  --region yul \
  --schedule daily \
  --restart no \
  --vm-memory 256 \
  --entrypoint /bin/sh \
  -- -c "curl -fsS --retry 3 --max-time 60 -X POST \
       -H \"Authorization: Bearer \$CRON_SECRET\" \
       https://$APP.fly.dev/cron/retention"
```

- `--schedule daily` — Fly accepts `hourly`, `daily`, `weekly`, `monthly`. There is no
  cron expression, so you do not get to pick the hour
- `--restart no` — it is a one-shot job, not a service; without this the machine loops
- `--entrypoint /bin/sh` — the curl image's entrypoint is `curl` itself, so a shell is
  needed for `$CRON_SECRET` to expand **inside** the machine
- `\$CRON_SECRET` is escaped so your local shell leaves it alone; the machine resolves
  it from the app's secrets
- `--retry 3` covers a cold start on a scaled-to-zero machine

Flag names have moved between flyctl versions — check `fly machine run --help` if one
is rejected.

### Verify before trusting it

```bash
APP="$(awk -F'"' '/^app =/{print $2}' fly.toml)"
curl -fsS -X POST -H "Authorization: Bearer <CRON_SECRET>" \
  "https://$APP.fly.dev/cron/retention"
# {"ok":true,"redactedPayloads":0,"retentionDays":90,"olderThan":"...","ts":"..."}

fly machine list --app "$APP"          # confirm the scheduled machine exists
fly logs --app "$APP" | grep retention # confirm it fired
```

A **404** means the secret did not match, or `CRON_SECRET` is unset where the request
came from. The route returns 404 rather than 401 so it is not discoverable by probing —
so a 404 is the expected response to a wrong secret, not a routing problem.

`redactedPayloads: 0` is the normal steady state once the job has been running: it only
counts rows redacted on that run.

### If you would rather not use a Fly machine

Any scheduler that can send one daily request works — the route accepts POST or GET.
GitHub Actions, using the repo you already have:

```yaml
# .github/workflows/retention.yml
name: PII retention
on:
  schedule:
    - cron: "0 4 * * *" # 04:00 UTC daily
  workflow_dispatch:
jobs:
  redact:
    runs-on: ubuntu-latest
    steps:
      - name: Redact expired webhook payloads
        run: |
          curl -fsS --retry 3 --max-time 60 -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "${{ secrets.APP_URL }}/cron/retention"
```

Add `CRON_SECRET` and `APP_URL` as repository secrets. This buys you a real cron
expression and a visible run history, at the cost of the schedule living outside Fly.

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
