# Runbook: Latency

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** Member read p95 over 800 ms for 15 minutes.

## Trigger

The site is available but materially slower than the reliability target.

## First Checks

1. Compare latency by route.
2. Check database query latency and connection pool.
3. Check Redis latency and fallback behavior.
4. Check Vercel region and cold-start metrics.
5. Check recent deploys touching rendering or data loading.

## Mitigation

Rollback recent performance regressions. Raise database capacity if the load is
real. Disable expensive optional panels if one dashboard path dominates.

## Escalation

Escalate if latency affects sign-in, card verification, or checkout for more
than 30 minutes.
