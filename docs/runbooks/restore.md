# Runbook: Restore

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** Manual use during data loss, bad migration, or restore drill.

## Trigger

Production data must be restored from a Neon branch or an off-vendor dump.

## First Checks

1. Declare the incident and freeze production deploys.
2. Identify the restore timestamp and data-loss window.
3. Confirm whether Stripe can rebuild affected subscription projections.
4. Preserve audit logs and migration history.
5. Notify the owner before switching application traffic.

## Mitigation

Create a restored Neon branch at the selected timestamp and run read-only
validation against it. Promote only after `/health/ready`, auth smoke, card
verification smoke, and Stripe projection smoke pass against the restored data.

## Escalation

Escalate to the owner and legal counsel if personal data loss, breach
notification, or customer impact is possible.
