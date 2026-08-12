# Runbook: Job Dead Letter

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** A background job exhausts retries.

## Trigger

Inngest or the outbox reports a job that cannot complete after retry.

## First Checks

1. Identify job name, payload id, and first failure.
2. Check whether the payload is safe to retry.
3. Check vendor status for any outbound dependency.
4. Check recent deploys touching the job handler.
5. Check whether related outbox rows are accumulating.

## Mitigation

Fix configuration or rollback if a deploy broke the handler. Retry idempotent
jobs only after confirming the idempotency key or processed-event guard.

## Escalation

Escalate if the job affects billing, deletion, or security workflows.
