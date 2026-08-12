# Runbook: Certificate Expiry

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** TLS certificate has under 21 days remaining.

## Trigger

Certificate renewal did not complete automatically.

## First Checks

1. Check Vercel domain verification status.
2. Check Cloudflare DNS records for apex and subdomains.
3. Confirm no CAA record blocks Vercel issuance.
4. Check whether the affected domain is proxied unexpectedly.
5. Check Vercel certificate renewal logs.

## Mitigation

Fix DNS or domain verification first. Reissue the certificate in Vercel once DNS
is correct. Do not enable HSTS preload until certificate renewal has been stable
for two weeks.

## Escalation

Escalate if expiry is under 7 days or if production traffic is already seeing
TLS errors.
