# Runbook: Error Spike

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** 5xx over 5% of requests for 5 minutes.

## Trigger

Production error rate crosses the SEV-1 threshold without a narrower alert
explaining it.

## First Checks

1. Compare the start time with the last Vercel deployment marker.
2. Filter Sentry by release and route.
3. Check `/health/ready` to separate dependency failure from application bug.
4. Check Stripe webhook and cron routes for retry storms.
5. Check Vercel function duration and memory.

## Mitigation

Rollback if errors started after a deployment. Disable the smallest relevant
feature flag if the spike is isolated. If a webhook or cron route is looping,
pause the scheduler or vendor delivery before it exhausts capacity.

## Escalation

Escalate to the owner if member auth, card verification, or billing paths are
affected for more than 15 minutes.
