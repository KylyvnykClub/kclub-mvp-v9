# Runbook: Backup Missing

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** Nightly dump absent from R2 by 05:00 UTC.

## Trigger

The expected off-vendor backup artifact is missing.

## First Checks

1. Check backup job logs and schedule.
2. Check R2 credentials and bucket availability.
3. Check Neon export or dump errors.
4. Confirm no credential rotation happened overnight.
5. Check whether the previous backup is within RPO.

## Mitigation

Run the backup job manually. If R2 is unavailable, write the encrypted dump to
the approved fallback storage and record the exception.

## Escalation

Escalate if no successful backup exists within the RPO window or if restore
evidence is also missing.
