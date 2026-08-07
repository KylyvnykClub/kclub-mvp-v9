# Phase 3 — Billing

**Goal, from [requirements.md §6.1](../requirements.md#61-delivery-plan):** both
subscriptions sell, lapse, recover and reconcile correctly against Stripe test
clocks.

**Exit criterion, verbatim:** _Both subscriptions sell, lapse, recover and
reconcile correctly against Stripe test clocks._

This phase rebuilds the billing surface that was committed out-of-sequence during
phase 0 work (commits `feat(billing)`, `feat(data)` on this branch). What exists
already, and what this phase must change:

- `stripeCustomers` mapping, `subscriptions` and `processedWebhooks` tables exist.
- `processWebhookOnce` enforces idempotency by the database primary key, as
  [ADR 0004](../decisions/0004-stripe-billing-as-system-of-record.md) requires.
- **The webhook endpoint does real work.** It projects entitlements inline in the
  handler. ADR 0004 requires: verify the signature, insert the event, write an
  outbox row, return 200 — projection happens in a worker. This is the single
  most important design rule in [integration.md §4](../integration.md#4-webhooks-and-events).
- **There is no `stripe_updated_at` watermark** on `subscriptions`, so
  out-of-order delivery is not handled.
- **The worker never re-fetches from Stripe.** Entitlements are derived from the
  webhook payload's own fields, which ADR 0004 explicitly forbids for anything
  that grants access.
- Checkout and portal session creation exist (`src/actions/stripe.ts`) but the
  listing checkout does not validate that the company belongs to the member.

## 1. Tasks

|Task|Delivers|FR|Depends on|Est|Status|
|-|-|-|-|-|-|
|T-3.1|Webhook endpoint reduced to verify + insert + outbox + 200; projection moved to a worker that re-fetches the subscription from Stripe, folds the entitlement and discards stale events via a `stripe_updated_at` watermark on `subscriptions`|FR-052, FR-053|—|2d|done 2026-08-06 — committed in 098d957; DI fetcher, watermark ordering, markDeleted keeps row|
|T-3.2|VIP checkout flow: one session per `vip_monthly` price from env, success/cancel pages that grant nothing (the redirect can never grant, because projection is webhook-only by construction of T-3.1)|FR-050|T-3.1|0.5d|partial — createCheckoutSessionAction + BillingSection UI exist; missing: success/cancel pages, no-grant test, locale-aware URLs, fail-closed when price env unset|
|T-3.3|Listing checkout flow per company, subscription metadata bound to the owning company, ownership validated before the session is created|FR-051|T-3.1|1d|open — session creation exists without ownership validation|
|T-3.4|Lapse semantics: a cancelled subscription keeps full access until its paid period ends, and loses it within 5 minutes of that period ending, via a scheduled job that projects from `current_period_end`|FR-054|T-3.1|1d|open|
|T-3.5|14-day grace period on failed payment with Stripe dunning retries, access kept through the grace, subscriber notified on failure and before grace expiry|FR-056|T-3.1|1d|open — sends email via Resend; the channel policy is FR-095 and stays in phase 6|
|T-3.6|Listing lifecycle: a company whose listing subscription lapses is unpublished automatically, and republished automatically when payment is recovered inside the grace period|FR-055|T-3.3, T-3.4, T-3.5|1d|open — publish state is owned by catalogue; this task writes through its repository|
|T-3.7|Customer Portal: update payment method, see invoices, cancel — all through Stripe-hosted sessions|FR-057|T-3.1|0.5d|open — `createPortalSessionAction` exists, needs verification and tests|
|T-3.8|Daily reconciliation job: local subscription state compared against Stripe's API view, any divergence alerted on, nothing silently repaired|FR-058|T-3.1, T-3.4|1d|open|
|T-3.9|Plan price management: `staff_owner` changes a plan's price, new checkout sessions use it, existing subscriptions are never silently repriced|FR-059|T-3.2, T-3.3|1d|open|
|T-3.10|Card data hygiene proof: an audit-style test walks every table and route to show no card number, CVC or PAN is ever stored, and that all card entry happens on Stripe-hosted surfaces|FR-060|T-3.2, T-3.7|0.5d|open|
|T-3.11|Account deletion with subscription choice: the deletion flow lists every active subscription and requires an explicit cancel-or-keep decision per subscription, never an implicit cancellation|FR-098|T-1.7, T-3.1|1d|open|

**Total: ~10.5 focused days.** [requirements.md §6.1](../requirements.md#61-delivery-plan)
budgets weeks 7–10 of effort for this phase. Most of the out-of-sequence WIP
scaffolding is reusable; the estimate is for the ADR 0004 rebuild and the
lifecycle jobs, which do not exist yet.

## 2. Tasks that need explaining

**T-3.1 is the phase's centre of gravity.** Everything else consumes its
projection. The current `processWebhookOnce` already gives idempotency by primary
key; what must change is where the work happens and what the projection trusts.
The worker re-fetches the subscription from the Stripe API (never the payload's
fields), writes the projected entitlement, and a `stripe_updated_at` column on
`subscriptions` makes a late-delivered event a no-op rather than a regression.

**T-3.5 delivers only the minimum notification.** FR-056 requires notifying the
subscriber on failure and before grace expiry, so email via Resend ships here.
Which channel applies (email where known, SMS otherwise) is FR-095's policy and
belongs to phase 6.

**T-3.6 does not own publish state.** Catalogue owns how a company is published;
billing owns when the listing subscription makes it payable. The task writes
through the catalogue repository, and the phase-2 task that owns FR-044 stays the
owner of the approve-then-publish rule.

**T-3.9 does not create prices in Stripe.** It changes which price ID the
checkout action reads from configuration and proves, by test, that the price of
an existing subscription is never touched.

## 3. Exit checks

The §6.1 criterion, decomposed into checks that can be run:

- [ ] A VIP subscription bought in CI against a Stripe test clock grants the card
      `vip` tier via the projection worker, and a direct visit to the success URL
      grants nothing
- [ ] A listing subscription bought per company publishes the company once active,
      and the same event delivered twice produces one entitlement
- [ ] Advancing the test clock past the period end of a cancelled subscription
      revokes access within 5 minutes
- [ ] Advancing the clock through a failed payment shows the 14-day grace with
      access kept, then revocation after grace expiry
- [ ] A lapsed listing subscription unpublishes the company; recovery inside the
      grace period republishes it
- [ ] The reconciliation job finds an intentionally injected divergence and alerts
      without repairing it
- [ ] The webhook endpoint returns 200 having written only an event row and an
      outbox row
- [ ] `python tools/check-plan.py --strict` and
      `python tools/check-docs.py --strict` pass

## 4. Demo script

Run against staging with Stripe test mode and test clocks, in this order:

1. Buy a VIP subscription. Show the webhook handler's response (200, event row +
   outbox row only). Advance the test clock; show the worker project `vip` onto
   the card within seconds.
2. Visit the success URL directly in a fresh browser. Show no entitlement.
3. Cancel the subscription, advance the clock to the period end, show the tier
   demoted within 5 minutes.
4. Fail a payment, advance the clock through the 14-day grace, show access kept
   and the subscriber notified; advance past grace expiry and show revocation.
5. Lapse a listing subscription; show the company unpublished. Recover payment
   inside the grace; show it republished.
6. Inject one local/Stripe divergence, run the daily reconciliation, show the
   alert.
7. Open the Customer Portal; update the payment method and cancel from there.
8. Show `check-plan.py --strict` and `check-docs.py --strict` green.
