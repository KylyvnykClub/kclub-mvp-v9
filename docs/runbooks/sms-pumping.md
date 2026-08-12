# Runbook: SMS Pumping

> **Status:** Draft
> **Owner:** Tech Lead
> **Last updated:** 2026-08-12
> **Alert:** SMS spend or verification completion-rate anomaly.

## Trigger

Twilio spend crosses the warning/page threshold or verification completion drops
far below normal.

## First Checks

1. Check Twilio Verify traffic by country, prefix, and IP.
2. Check registration request rate and source IPs.
3. Confirm `AUTH_DEV_PHONE_BYPASS_ENABLED` is disabled outside development.
4. Check Upstash rate limiting health.
5. Check Cloudflare firewall events.

## Mitigation

Disable registration SMS with the kill switch if spend is accelerating. Tighten
Twilio geographic permissions, enable or confirm Fraud Guard, and block abusive
source ranges at Cloudflare.

## Escalation

Escalate to the owner immediately at the 80% spend threshold. Record any
customer-facing registration outage.
