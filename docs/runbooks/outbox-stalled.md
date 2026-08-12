# Runbook: Outbox Stalled

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** Oldest unprocessed outbox row older than 10 minutes.

## Trigger

Background effects are no longer being drained.

## First Checks

1. Check `/api/cron/outbox-drain` invocation history.
2. Check `CRON_SECRET` in production.
3. Inspect oldest outbox rows by type and error.
4. Check Sentry for job or projection failures.
5. Check Stripe API status if rows are billing-related.

## Mitigation

Run the drain route manually with the cron bearer token. If one poison row is
blocking progress, mark it for manual review only after preserving its payload
and error.

## Escalation

Escalate if payment entitlements are delayed or if manual drain cannot advance
the queue.
