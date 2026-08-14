# Runbook: Reconciliation Divergence

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-14
> **Alert:** Nightly reconciliation finds local state differs from Stripe.

## Trigger

The daily read-only reconciliation job found that the local subscription
projection disagrees with Stripe, the billing source of truth. The job only
signals the divergence through the outbox alert topic; it does not repair or
overwrite subscription rows.

## First Checks

1. Identify the affected Stripe customer and subscription ids from the alert
   payload.
2. Check the last processed Stripe event timestamp and the local
   `stripe_updated_at` watermark.
3. Check whether webhook delivery was delayed or failed.
4. Check projection code errors in Sentry and outbox drain logs.
5. Confirm no redirect-success path or manual database edit wrote entitlement
   state.

## Mitigation

Do not edit the row manually from the alert alone. Re-fetch the subscription
from Stripe and rerun projection through the normal idempotent webhook/outbox
path. Preserve the divergent local row for audit until the repair is recorded.

## Escalation

Escalate if divergence affects more than one customer or grants access without
an active Stripe subscription.
