# Runbook: Webhooks Silent

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** No Stripe events received for 6 hours during business hours.

## Trigger

Stripe event ingestion appears silent when production should be receiving
subscription lifecycle traffic.

## First Checks

1. Check Stripe endpoint delivery logs for `/api/webhooks/stripe`.
2. Confirm the webhook endpoint URL and signing secret.
3. Check recent DNS, Vercel, or route changes.
4. Trigger a Stripe test event in the appropriate mode.
5. Check processed webhook rows and outbox rows.

## Mitigation

Fix the endpoint configuration before replaying events. Once delivery is
healthy, replay missing Stripe events from the Stripe dashboard. Never recreate
entitlements manually unless reconciliation is also recorded.

## Escalation

Escalate if live payments occurred during the silent window or if replay fails.
