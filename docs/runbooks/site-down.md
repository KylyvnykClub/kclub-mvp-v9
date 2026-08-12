# Runbook: Site Down

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** `/health/ready` failing for 2 minutes.

## Trigger

The readiness endpoint returns non-200 from production or from at least two
synthetic regions. Treat this as SEV-1 until proved otherwise.

## First Checks

1. Open `/health/live`; if it is down too, suspect deploy/runtime failure.
2. Open `/health/ready`; note which dependency check failed.
3. Check Vercel deployment status and recent deployment markers.
4. Check Neon and Upstash status dashboards.
5. Check Sentry for the first error after the last good health check.

## Mitigation

Rollback first if the failure correlates with a deploy. If only Neon fails,
confirm pooled `DATABASE_URL` and direct migration activity. If only Redis
fails, keep the site up only if product paths degrade as designed; otherwise
disable the affected feature flag.

## Escalation

Escalate to the owner after 30 minutes or immediately if card verification is
also failing. Open vendor support tickets for Vercel, Neon, or Upstash when
their dashboard confirms an incident or the failure is not explained locally.
