# Runbook: Entitlement Lag

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-10-12
> **Alert:** Stripe entitlement projection p95 lag over 5 minutes.

## Trigger

Paid subscriptions are not becoming local access within the freshness target.

## First Checks

1. Check `/api/webhooks/stripe` delivery in Stripe.
2. Check outbox depth and oldest unprocessed row.
3. Check `/api/cron/outbox-drain` invocation history.
4. Check Sentry for projection errors.
5. Confirm `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `CRON_SECRET`.

## Mitigation

Run the outbox drain manually with the cron bearer token. If Stripe API calls
are failing, leave webhook ingestion enabled so events are stored and retried.
Do not grant entitlements from redirect success pages.

For one partner whose listing payment shows unpaid although Stripe captured
it (the `payment_intent.*` event never arrived), use **Resync payment from
Stripe** in the admin company sheet, Payment section. It re-reads the
company's listing PaymentIntents from Stripe, records the capture at its own
clock and starts the monthly subscription from the saved card; it grants
nothing Stripe does not report. Then confirm the endpoint is subscribed to
`payment_intent.*`.

## Escalation

Escalate if any paid member remains unprojected after 15 minutes or if the
outbox cannot be drained manually.
