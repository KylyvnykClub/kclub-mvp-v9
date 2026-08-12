# Runbook: Reconciliation Divergence

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** Nightly reconciliation finds local state differs from Stripe.

## Trigger

The local subscription projection disagrees with Stripe, the billing source of
truth.

## First Checks

1. Identify the affected Stripe customer and subscription ids.
2. Check the last processed Stripe event timestamp.
3. Check whether webhook delivery was delayed or failed.
4. Check projection code errors in Sentry.
5. Confirm no redirect-success path wrote entitlement state.

## Mitigation

Re-fetch the subscription from Stripe and rerun projection through the normal
idempotent path. Preserve the divergent local row for audit until the repair is
recorded.

## Escalation

Escalate if divergence affects more than one customer or grants access without
an active Stripe subscription.
