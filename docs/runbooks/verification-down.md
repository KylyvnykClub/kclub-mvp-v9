# Runbook: Verification Down

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** Card verification synthetic check fails from 2 of 3 regions.

## Trigger

The public card verification path cannot return a trustworthy verdict. This is
SEV-1 because partners may turn away valid members.

## First Checks

1. Open `/health/live` and `/health/ready`.
2. Test a known valid card token and a known invalid token.
3. Check recent deploys touching `src/lib/card-token.ts`, card routes, or card
   migrations.
4. Check Neon availability and query latency.
5. Check CDN or domain changes for the card subdomain.

## Mitigation

Rollback if the break follows a deploy. If the database is unavailable, confirm
whether the cached-verdict fallback is serving recently seen tokens. If token
hashing or secret rotation is implicated, stop rotation and preserve the
current `BETTER_AUTH_SECRET` until impact is understood.

## Escalation

Escalate to the owner immediately when valid cards cannot be verified. Prepare a
member-facing status update if the outage exceeds 15 minutes.
