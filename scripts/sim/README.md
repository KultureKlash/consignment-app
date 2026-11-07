# scripts/sim/ — production simulation suite

These scripts verify that the imported prod Neon catalog behaves correctly when
run through the same service functions Shopify webhooks call. They're separate
from the unit tests in `tests/` (which use synthetic in-memory data) — this
suite exercises the real catalog end-to-end without touching Shopify checkout.

## Hard guarantees

- **No emails are ever sent.** Each script sets `SIMULATION_MODE=1` at startup,
  and `app/services/email/email.server.ts` short-circuits Resend when that env
  var is set. Every email call appears as a `"Email skipped (SIMULATION_MODE)"`
  log line instead.
- **No Shopify inventory writes.** `syncInventory()` in
  `app/services/inventory/inventory.server.ts` has the same kill-switch, so
  scenarios that allocate listings (script 03) don't drift the dev store.
- **Clean rollback.** Script 03 tracks every Order / Listing / Payout / Consignor
  change it makes and undoes them in a `finally` block. After a successful run
  Neon is byte-for-byte identical to before.

## Run order

```bash
# 1. Static integrity audit — exit 0 means catalog is internally consistent.
npx tsx scripts/sim/01-audit-data.ts

# 2. Allocation determinism — exhaustive sale/refund prediction across every
#    non-trivial multi-listing variant. Prints 20 sample predictions you can
#    eyeball.
npx tsx scripts/sim/02-allocation.ts

# 3. End-to-end lifecycle — sale -> payout -> refund on real consignors.
#    Requires --go for actual execution.
npx tsx scripts/sim/03-lifecycle.ts          # dry run
npx tsx scripts/sim/03-lifecycle.ts --go     # execute + rollback

# 4. Neon ↔ Shopify inventory parity — needs a fresh Shopify offline token.
#    Refresh by opening the Konsign app in your admin first.
npx tsx scripts/sim/04-inventory-parity.ts

# 5. Payout totals — read-only verification of existing payout math.
#    Or pass --simulate to dry-run a bulk payout for every consignor.
npx tsx scripts/sim/05-payout-totals.ts            # verify mode
npx tsx scripts/sim/05-payout-totals.ts --simulate # synthetic + rollback

# 6. OTP login — request + verify cycle, lockout, expiry, anti-enumeration,
#    rate-limit probe. Cleans up its OtpCode rows.
npx tsx scripts/sim/06-otp.ts

# 7. Withdrawal lifecycle — request -> approve -> complete, request -> deny,
#    and the active-only + ownership guards. Restores listings at end.
npx tsx scripts/sim/07-withdrawal.ts

# 8. Multi-item / multi-consignor single order — per-item transactions,
#    per-consignor fee math + balances, one email per consignor. Rolls back.
npx tsx scripts/sim/08-multi-item-order.ts

# 9. High-volume stress + invariants — N sales (default 100) as mixed 1-3 item
#    orders, ~half paid out, ~20% refunded, then system-wide money invariants.
#    Rolls back by default; --keep persists for UI inspection.
npx tsx scripts/sim/09-stress.ts            # 100 transactions
npx tsx scripts/sim/09-stress.ts 250        # 250 transactions
npx tsx scripts/sim/09-stress.ts 100 --keep # keep the data in prod
```

## What each script catches

| Script | Catches |
|---|---|
| 01 audit | Null/zero prices, FK orphans, missing Shopify links, duplicate emails, consignors paid more than net earned |
| 02 allocation | Drift between `processOrder()` SQL and the documented FIFO/lowest-price rule |
| 03 lifecycle | Broken `creditOrder`/`createPayout`/`markPaid`/`refundOrder`/`ReassignmentLog` flow |
| 04 parity | Shopify variant qty != count(active listings at lowest price) |
| 05 totals | Payout math drift — sum(payouts) != net(sales - refunds) per consignor |
| 06 otp | OTP request/verify, lockout, expiry, enumeration, rate-limit |
| 07 withdrawal | Withdrawal state machine + active-only/ownership guards |
| 08 multi-item | Multi-consignor order: per-item txns, fee math, email grouping |
| 09 stress | N transactions at once; system-wide money invariants hold |

## Findings surfaced by these sims

1. **Variant recreation after refund/reassign (FIXED, merged to `main`)** — when a size's last unit sold, the deleted Shopify variant was never recreated on refund-restore or post-payout reassignment.
2. **OTP rate limit was dead code (FIXED in `49df987`)** — `requestOtp` deleted all prior `OtpCode` rows before the per-hour count window could accumulate, so the "max 3 per hour" guard never fired. It now soft-invalidates (sets `usedAt`) so the window survives. `06-otp.ts` check 8 covers it.
3. **Webhook failures were silently dropped (FIXED)** — `createWebhookHandler` returned 200 on handler error, so Shopify never redelivered, and nothing replays `WebhookEvent` rows with status `failed`. It returns 500 now. See `docs/system-overview.md`.
4. **Invariant 4 in `09-stress.ts` was a false positive (FIXED)** — it compared `paid`, summed from payouts created during the run, against `net` scoped to `runOrderIds`. Phase 2 selects payout transactions with no run filter (line 133), so a run payout also settles pre-existing unpaid sales. Any consignor carrying unpaid sales before the run tripped it, and the reported overage was always exactly their pre-existing eligible balance. It now calls `findOverpaidConsignors()`, which compares whole populations per consignor.

   The lesson generalizes: **never scope one side of a money invariant and not the other.** A payout settles transactions by age, not by batch.

## Known gotcha — null categories in imported data

The Laravel dump didn't preserve product categories, so every imported product
has `category = null`. The refund routing in
`app/services/orders/refunds.server.ts:229` defaults null-category to footwear:

```typescript
const isFootwear = !category || category.startsWith("Footwear");
```

This means every post-payout refund currently reassigns to "Kulture Klash"
(footwear shop consignor). Script 03's `E.apparel` scenario will SKIP because
no apparel-categorized products exist. To exercise the apparel path, manually
set `category = "Apparel"` on some products before running, or do a real
buy/refund through Shopify with a manually-categorized product.

## When a Shopify token expires mid-run

Scripts 04 (and the inventory-fix scripts in the parent dir) detect `HTTP 401`
and exit cleanly with `process.exitCode = 2` plus a "refresh and re-run"
message. The offline access tokens on the dev store rotate roughly every 20-30
minutes — open the Konsign app in your Shopify admin to refresh, then re-run.

## After tests pass — what's left for "real" testing

The sims cover code-path correctness. They don't cover:

- Shopify's HTTP webhook delivery + HMAC signature validation
  (`tests/webhooks.test.ts` covers idempotency unit-level)
- Real bogus-payment checkout UI flow
- Stock decrementing visibly in Shopify storefront after sale
- The full Shopify -> Neon -> Email -> Consignor portal cycle

For those, run a real bogus order through `kulture-konsign-dev.myshopify.com`
checkout once the sims are green.
