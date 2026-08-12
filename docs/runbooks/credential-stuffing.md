# Runbook: Credential Stuffing

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** Failed sign-ins over 100/minute or one IP hitting many accounts.

## Trigger

Authentication traffic indicates automated account takeover attempts.

## First Checks

1. Check failed login rate by IP, ASN, and phone prefix.
2. Confirm Upstash rate limits are reachable.
3. Check whether successful logins rose with failures.
4. Check Sentry and logs for auth errors.
5. Confirm no dev bypass is enabled outside development.

## Mitigation

Tighten auth rate limits, block abusive networks at Cloudflare, and force
step-up or password reset only for accounts with suspicious successful access.

## Escalation

Escalate if any account takeover is suspected or if the attack blocks normal
sign-in.
