# Runbook: Security Incident

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** First hour of a suspected breach.

## Trigger

Any credible suspicion of unauthorized access, credential leak, data exposure,
or staff account compromise.

## First Checks

1. Declare an incident; false alarms are acceptable.
2. Rotate the suspected credential before investigating deeply.
3. Preserve Sentry, Vercel, Cloudflare, Stripe, Twilio, and audit-log evidence.
4. Identify affected systems and time window.
5. Confirm whether member list, phone numbers, referrals, or billing data are
   implicated.

## Mitigation

Contain first: rotate keys, revoke sessions, disable affected routes or feature
flags, and block abusive origins. Do not delete evidence. Do not communicate
externally until the owner has the impact summary.

## Escalation

Escalate to the owner immediately. Involve legal counsel if GDPR, US state
breach law, payment data, or third-party personal data may be in scope.
