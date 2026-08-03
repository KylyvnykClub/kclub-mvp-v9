# Observability

> **Status:** In review
> **Owner:** _(fill in)_
> **Last updated:** 2026-08-02
> **Write when:** before the first production deploy, together with
> [reliability.md](reliability.md).

How we know whether the system is healthy, and how we find out why when it is
not. This document exists to serve the targets set in
[reliability.md](reliability.md#1-reliability-targets) — if something is
promised there, it must be measurable here.

---

## 1. What we measure and why

Every signal below exists because someone would act on it. Anything else is a
bill.

| Question to answer | Signal | Where it comes from |
| --- | --- | --- |
| Is the service up? | Synthetic checks on `/health/ready`, the sign-in page and a known verification token | Better Stack, every 60 s from three regions |
| Can a stranger verify a card right now? | Synthetic check that scans a permanent test token and asserts the verdict | Better Stack |
| Are users succeeding? | Registration funnel completion, sign-in success rate, catalogue searches returning results, checkout completion | Application metrics, emitted from the domain layer |
| Is it fast enough? | Latency histograms by route; Core Web Vitals from real users | OpenTelemetry; Vercel Speed Insights |
| Did the last deploy hurt? | Error rate and p95 latency, before and after the deployment marker | Metrics annotated with the release SHA |
| **Is anyone paying and not getting access?** | Time from `stripe_event.received_at` to entitlement write; count of subscriptions active in Stripe but not locally | Application metrics; the nightly reconciliation job |
| Are we losing money to SMS fraud? | Verifications started vs. completed, by country; daily Twilio spend | Twilio usage API, polled hourly |
| Is moderation keeping up? | Queue depth and age of the oldest item, per queue | Application metrics, gauge every minute |
| Is anything stuck in the background? | Outbox depth and age of the oldest unprocessed row; Inngest failure rate | Application metrics; Inngest |
| Is someone attacking sign-in? | Failed sign-ins per minute; distinct accounts per source IP | Application metrics |
| Is a staff account behaving unusually? | Member records opened per staff user per hour | Audit log, aggregated daily |
| Is the club growing? | New verified members, active subscriptions, MRR, published partners | Application metrics and the finance dashboard |

The one worth calling out is **"is anyone paying and not getting access"**. It
is the failure this product cannot detect by watching error rates — every
component reports success while the member sits without their VIP. It gets its
own metric, its own alert and its own runbook.

---

## 2. Tooling

Chosen to be few. Three engineers cannot maintain five consoles, and a signal
nobody looks at is worse than one that does not exist, because it creates the
belief that someone is watching.

| Signal | Tool | Retention | Cost driver |
| --- | --- | --- | --- |
| Logs | Axiom, via the Vercel log drain | 30 days | Ingested volume — kept down by sampling `INFO` on hot routes at 10% and never logging request bodies |
| Metrics | Application metrics exported through OpenTelemetry to Axiom; dashboards in Axiom | 90 days | Label cardinality — route templates only, never a raw URL, never a member id as a label |
| Traces | OpenTelemetry to Axiom | 7 days | Sample rate: 10% of successful requests, 100% of errors and of anything over 1 s |
| Errors | Sentry (server and browser) | 90 days | Event volume; grouped by fingerprint, with noisy groups muted rather than ignored |
| Uptime and synthetics | Better Stack | 12 months | Number of checks |
| Status page | Better Stack, separate host and DNS | — | — |
| Real user monitoring | Vercel Speed Insights + Analytics | 30 days | Page views. Privacy note: no cookie, no cross-site identifier, no third-party pixel — this is the only visitor measurement in the product and it is why no consent banner is needed |
| Database insight | Neon metrics + `pg_stat_statements` sampled into Axiom hourly | 90 days | — |
| Job execution | Inngest's own dashboard, with failures forwarded to Sentry | 30 days | — |
| Payment health | Stripe dashboard and Stripe's own alerts, plus our reconciliation job | Stripe's retention | — |

**Budget:** about $80/month at launch. If observability approaches 20% of
platform cost, the sampling rates above are the lever — not switching a tool
off.

---

## 3. Logging

**Format:** structured JSON, one object per line, written to stdout and drained
by the platform. Human-readable pretty-printing in development only. JSON
because a log we cannot query across routes and jobs is a log we will not read
during an incident.

**Required fields on every entry:**

| Field | Purpose |
| --- | --- |
| `timestamp` | ISO 8601, UTC, always |
| `level` | `error` / `warn` / `info` / `debug` |
| `correlation_id` | Follows one request through HTTP, database, jobs and outbound calls. Generated at the edge, propagated into every outbox row and every Inngest job, and shown to the user as their "reference" on an error screen |
| `service`, `release` | The deployment SHA, so behaviour can be attributed to a release |
| `route` | The route template (`/app/companies/[id]`), never the concrete URL — a concrete URL is an identifier leak and a cardinality bomb |
| `actor_type`, `actor_id` | `member` / `staff` / `system` plus the internal id. Never a phone number, never a name |
| `duration_ms` | On every completed request and every outbound call |
| `outcome` | `ok` / `client_error` / `server_error` / `degraded` |
| `event` | For business events: a stable name such as `member.verified`, `subscription.activated` |

**Level policy:**

| Level | Use for | Example |
| --- | --- | --- |
| ERROR | A human must look, and something is broken on our side | Stripe projection failed after the final retry; a migration failed; an outbound call's circuit breaker opened |
| WARN | Unexpected but handled, and worth a trend | Rate limit triggered; reconciliation repaired a divergence; a retry succeeded on the second attempt; a Twilio verification failed for the fifth time on one number |
| INFO | Business events worth an audit trail, and request completion | `member.verified`, `company.published`, `referral.delivered`, `entitlement.granted` |
| DEBUG | Diagnostics. Off in production, enabled per-request by a header only a staff session may set | Query plans, external request/response shapes with values redacted |

A rule that keeps ERROR meaningful: **a user's mistake is never an ERROR**. A
wrong password, an expired code, a validation failure and a rate limit are all
INFO or WARN. If ERROR contains things nobody acts on, nobody acts on ERROR.

**Never logged:** passwords, hashes, session ids, TOTP seeds, one-time codes, QR
verification tokens, full phone numbers (a keyed hash plus the last two digits
instead), referral client contact details, request bodies on authentication and
referral routes, `Authorization` and `Cookie` headers, Stripe secret keys. This
list mirrors [security.md §3](security.md#3-data-protection) and is enforced by
a redaction layer in the logger plus a test that proves it.

**Retention:** application logs 30 days in Axiom. The audit log is a different
thing entirely — it lives in PostgreSQL, is append-only, and is kept 7 years
([security.md §7](security.md#7-auditing-and-access-control)). Conflating the
two is a mistake worth naming: a log is diagnostic and disposable; an audit
entry is evidence.

---

## 4. Metrics

### Service metrics

| Metric | Type | Labels | Why it matters |
| --- | --- | --- | --- |
| `http_requests_total` | counter | route template, method, status class | Traffic and error rate, the numerator and denominator of the SLO |
| `http_request_duration_ms` | histogram | route template | p50/p95/p99 latency against the targets in [requirements.md §5.1](requirements.md#51-performance) |
| `db_query_duration_ms` | histogram | operation name | Finds the slow query before the page gets slow |
| `db_pool_in_use` | gauge | — | The first resource to run out ([reliability.md §9](reliability.md#9-capacity-planning)) |
| `external_call_duration_ms` | histogram | vendor, operation, outcome | Which third party is having the bad day |
| `circuit_breaker_state` | gauge | vendor | Open means we are shedding load deliberately |
| `outbox_pending` / `outbox_oldest_age_seconds` | gauge | — | The single best indicator that background processing has stopped |
| `job_runs_total` | counter | job name, outcome | Job failure rate |
| `rate_limit_triggered_total` | counter | limit name | Abuse, and also a badly tuned limit hurting real users |
| `cache_hit_ratio` | gauge | cache name | Only actionable if it collapses |

### Business metrics

| Metric | Why it matters | Owner |
| --- | --- | --- |
| `members_verified_total` | Growth, and the denominator of the funnel | Client |
| `registration_funnel` (started → code sent → code verified → profile complete) | Isolates the SMS step, which is the assumption most likely to be wrong ([requirements.md §7](requirements.md#7-assumptions)) | Client |
| `sms_verifications_started_total` / `_completed_total` by country | Started-without-completed by an unusual country is what SMS pumping looks like before the bill arrives | Tech lead |
| `sms_spend_usd_today` | The one metric with a hard money cap behind it | Tech lead |
| `subscriptions_active` by plan | MRR, and the success metric in [brief.md](brief.md#what-success-looks-like) | Client |
| `entitlement_lag_seconds` (p95, p99) | Payment made vs. access granted. The failure nobody else detects | Tech lead |
| `stripe_reconciliation_divergences_total` | Every non-zero value means an event was lost | Tech lead |
| `involuntary_churn_rate` | Failed payments not recovered in the grace period — usually a fixable dunning problem, not a customer decision | Client |
| `companies_pending_moderation` / `moderation_queue_oldest_age_hours` | The human bottleneck, per FR-048 | Client |
| `catalogue_searches_total` / `catalogue_zero_result_ratio` | High zero-result ratio means the catalogue is too thin in a place people are looking — a sales lead, not just a metric | Client |
| `referrals_sent_total`, `_accepted_ratio` | Whether the VIP feature is worth its complexity | Client |
| `card_verifications_total` by outcome | Whether partners actually scan cards, which is whether the club works in the physical world | Client |

The last row is the one that would tell the client, six months in, whether the
product's core ritual is real. It is worth more than any technical metric here.

---

## 5. Tracing

| Aspect | Approach |
| --- | --- |
| Enabled | Yes, from launch |
| Standard | OpenTelemetry, exported to Axiom |
| Sample rate | 10% of successful requests; **100% of errors, of anything over 1 s, and of every payment or entitlement operation regardless of outcome** |
| Instrumented boundaries | Inbound HTTP, database queries, Redis, Stripe, Twilio, Resend, R2, Inngest job execution |
| Span attributes | Route template, actor type, outcome, vendor operation. Never a phone number, a name, or a raw URL |
| Trace ↔ log correlation | The `correlation_id` is the trace id, so one identifier moves from the user's error screen to the trace to the log line |
| Async continuation | The trace context is stored on the outbox row and restored when the job runs, so "member paid" and "entitlement granted" appear in one trace even though they are minutes and two processes apart |

That last row is the reason tracing is worth its cost here. The system's hardest
question — where did this payment's effect go — spans an HTTP request, a
database row, a queue and a worker, and nothing but a linked trace answers it
quickly.

---

## 6. Health checks

| Endpoint | Verifies | Used by |
| --- | --- | --- |
| `/health/live` | The process is running and can serve a response. No dependency is touched | Platform restarts |
| `/health/ready` | Database reachable (`SELECT 1` with a 2 s timeout), Redis reachable, required environment variables present and valid | Load balancer routing, deployment gate |
| `/health/deep` | Everything in `/health/ready` plus: Stripe API reachable, Twilio API reachable, outbox age under 10 minutes, last reconciliation under 26 hours old | Synthetic monitoring every 5 minutes, and the first thing a responder opens |
| `card.kclub.com/v/<known-test-token>` | The full critical path end to end, from edge to database to render | Synthetic check every 60 s from three regions |

Readiness checks dependencies and liveness does not — deliberately. A liveness
check that fails because the database is slow causes the platform to restart
every healthy instance, turning a degraded database into a total outage. This is
the most common way a health check makes an incident worse.

`/health/deep` is never used for automated routing decisions, only for humans
and alerts, because "Stripe is down" must not remove our instances from service.

---

## 7. Alerting

Every alert here is urgent, actionable and real. An alert that has been ignored
twice is deleted or fixed at the next review — a noisy pager is worse than no
pager, because it trains the responder to dismiss.

| Alert | Condition | Severity | Routed to | Runbook |
| --- | --- | --- | --- | --- |
| Card verification failing | Synthetic check fails from 2 of 3 regions, twice consecutively | SEV-1 | Phone (tech lead) | [`verification-down`](#9-runbooks) |
| Site down | `/health/ready` failing for 2 minutes | SEV-1 | Phone | [`site-down`](#9-runbooks) |
| Error rate spike | 5xx over 5% of requests for 5 minutes | SEV-1 | Phone | [`error-spike`](#9-runbooks) |
| Error rate spike after deploy | 5xx doubles within 10 minutes of a deployment marker | SEV-1 | Phone | [`bad-deploy`](#9-runbooks) — rollback first |
| **Entitlement lag** | p95 lag over 5 minutes, or any single event unprojected for 15 minutes | SEV-2 | Chat + phone in business hours | [`entitlement-lag`](#9-runbooks) |
| **No Stripe events received** | Zero events in 6 hours between 08:00–22:00 UTC | SEV-2 | Chat | [`webhooks-silent`](#9-runbooks) |
| Reconciliation divergence | Any divergence found by the nightly job | SEV-2 | Chat | [`reconciliation-divergence`](#9-runbooks) |
| **SMS spend** | 50% of the daily cap | SEV-3 | Chat | [`sms-pumping`](#9-runbooks) |
| **SMS spend** | 80% of the daily cap, or verification completion below 40% for an hour | SEV-1 | Phone | [`sms-pumping`](#9-runbooks) |
| Outbox stalled | Oldest unprocessed row older than 10 minutes | SEV-2 | Chat | [`outbox-stalled`](#9-runbooks) |
| Database saturation | CPU over 80% for 15 minutes, or pool over 80% | SEV-2 | Chat | [`db-saturation`](#9-runbooks) |
| Latency regression | p95 on member reads over 800 ms for 15 minutes | SEV-2 | Chat | [`latency`](#9-runbooks) |
| Sign-in attack | Failed sign-ins over 100/minute, or one IP hitting more than 20 distinct accounts | SEV-2 | Chat | [`credential-stuffing`](#9-runbooks) |
| Job failures | Any job exhausting its retries | SEV-2 | Chat | [`job-dead-letter`](#9-runbooks) |
| Backup missing | No nightly dump in R2 by 05:00 UTC | SEV-2 | Chat | [`backup-missing`](#9-runbooks) |
| Certificate expiry | Under 21 days remaining | SEV-3 | Chat | [`cert-expiry`](#9-runbooks) |
| Moderation queue age | Oldest item over 3 business days | SEV-3 | Chat (client, not engineering) | Staffing, not an engineering runbook |
| Vendor status | Stripe, Twilio, Vercel, Neon, Cloudflare status page changes | SEV-3 | Chat | Context for whatever else is firing |

Severity definitions and the on-call arrangement — including its honest
limitations — are in
[reliability.md §7](reliability.md#7-incident-process).

**Notification channels:** SEV-1 pages a phone, any hour. SEV-2 posts to the
team chat with a mention; out of hours it waits. SEV-3 posts to chat without a
mention. Nothing goes to email, because email is where alerts go to be ignored.

**Alert review:** monthly, ten minutes. For each alert: did it fire, was it
acted on, was it right? Alerts that never fire are as suspect as alerts that
always do — an alert that has not fired in six months may be broken rather than
reassuring, and the review is when someone tests it.

---

## 8. Dashboards

Four. A fifth would go unopened.

| Dashboard | Answers | Audience | Link |
| --- | --- | --- | --- |
| Service health | Is anything on fire right now? Traffic, error rate, p95 latency by route, dependency status, outbox depth | On-call | _(fill in — Axiom, at setup)_ |
| Deployment | Did the last release change anything? Error rate and latency before/after each deployment marker, with the SHA and author | Engineers | _(fill in)_ |
| Money and access | Are payments turning into access? Entitlement lag, reconciliation divergences, failed payments, dunning recoveries, checkout completion | Tech lead + client | _(fill in)_ |
| Club health | Is the club growing and is the queue clear? Members, subscriptions, MRR, funnel, published partners, moderation queue age, zero-result searches | Client | Staff console, so it needs no separate tool or login |

The fourth deliberately lives in the product itself (FR-081, FR-082). A business
dashboard behind an engineering tool's login is a dashboard the client never
opens.

---

## 9. Runbooks

Written for someone who did not build the system and has just been woken up.
Each is one page: what the alert means, what to check first, the three most
likely causes in order of likelihood, how to fix or mitigate, and when to
escalate. They live in `docs/runbooks/` and each is linked from its alert.

| Runbook | Covers | Location |
| --- | --- | --- |
| `site-down` | `/health/ready` failing | `docs/runbooks/site-down.md` |
| `verification-down` | Card verification synthetic failing | `docs/runbooks/verification-down.md` |
| `error-spike` | 5xx above threshold | `docs/runbooks/error-spike.md` |
| `bad-deploy` | Errors correlated with a release — rollback procedure first, diagnosis second | `docs/runbooks/bad-deploy.md` |
| `entitlement-lag` | Payments not becoming access | `docs/runbooks/entitlement-lag.md` |
| `webhooks-silent` | No Stripe events arriving | `docs/runbooks/webhooks-silent.md` |
| `reconciliation-divergence` | Local state differs from Stripe | `docs/runbooks/reconciliation-divergence.md` |
| `sms-pumping` | SMS spend or completion-rate anomaly | `docs/runbooks/sms-pumping.md` |
| `outbox-stalled` | Background processing stopped | `docs/runbooks/outbox-stalled.md` |
| `db-saturation` | Database CPU or connections | `docs/runbooks/db-saturation.md` |
| `latency` | p95 regression | `docs/runbooks/latency.md` |
| `credential-stuffing` | Authentication under attack | `docs/runbooks/credential-stuffing.md` |
| `job-dead-letter` | A job exhausted its retries | `docs/runbooks/job-dead-letter.md` |
| `backup-missing` | Nightly dump absent | `docs/runbooks/backup-missing.md` |
| `cert-expiry` | Certificate renewal did not happen | `docs/runbooks/cert-expiry.md` |
| `restore` | Restoring the database from a branch or a dump | `docs/runbooks/restore.md` |
| `security-incident` | The first hour of a suspected breach ([security.md §9](security.md#9-incident-response)) | `docs/runbooks/security-incident.md` |

**The rule that keeps them true:** every paging alert must have a runbook before
the alert is enabled, and a runbook is re-read by its author after any
architecture change that touches it. An untested runbook is a story about how
the system used to work.

**Status at 2026-08-02:** none of these files exist yet. They are written during
phase 7 and their existence is a launch blocker in
[requirements.md §8](requirements.md#8-acceptance-criteria).
