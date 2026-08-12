# Runbook: DB Saturation

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** Database CPU or connection pool over threshold.

## Trigger

Neon CPU, connection pool, or query latency threatens availability.

## First Checks

1. Confirm the app uses pooled `DATABASE_URL`.
2. Check whether migrations or seeds are using production.
3. Identify slow statements in Neon query insights.
4. Check Vercel concurrency and route mix.
5. Check recent deploys touching data access.

## Mitigation

Raise Neon compute bounds if this is real traffic. Terminate runaway queries if
one statement is responsible. Rollback if a deploy introduced the saturation.

## Escalation

Escalate if `/health/ready` fails, card verification is slow, or saturation
persists for 15 minutes after mitigation.
