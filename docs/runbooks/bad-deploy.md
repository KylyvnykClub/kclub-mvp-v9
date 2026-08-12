# Runbook: Bad Deploy

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** Errors correlate with a deployment marker.

## Trigger

5xx, readiness failure, or critical path regression begins within 10 minutes of
a deployment.

## First Checks

1. Identify the previous healthy Vercel deployment.
2. Confirm whether the deployment included a database migration.
3. Check whether the old code is compatible with the new schema.
4. Capture the failing route and first Sentry issue.

## Mitigation

Rollback the Vercel production alias first when schema compatibility allows it.
If a migration blocks rollback, stop further deploys, keep traffic on the least
broken version, and use the migration down path only after confirming data
impact.

## Escalation

Escalate immediately if rollback is unsafe or if payments, sessions, or card
verification are affected.
