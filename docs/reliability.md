# Reliability

> **Status:** In review
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-02
> **Write when:** before the first production deploy.

What "working" means in numbers, what happens when it stops, and how the system
recovers. How this is measured and alerted on is in
[observability.md](observability.md).

---

## 1. Reliability targets

|Objective|Target|Measured over|Measured how|
|-|-|-|-|
|Availability — card verification|99.95%|30 rolling days|Synthetic check every 60 s from three regions; a check is successful if it returns a correct verdict in under 2 s|
|Availability — member area|99.9%|30 rolling days|Ratio of non-5xx responses on member routes, from server-side metrics|
|Availability — sign-up and sign-in|99.9%|30 rolling days|Ratio of successful authentication attempts that failed for our reasons, not the user's|
|Availability — staff console|99.5%|30 rolling days|As member area, on `admin.` routes|
|Latency — member reads (p95)|< 300 ms|30 rolling days|Server timing histogram by route|
|Latency — card verification (p95)|< 500 ms|30 rolling days|Synthetic check|
|Error rate — all routes|< 0.5% 5xx|30 rolling days|Metrics by route and status|
|Entitlement freshness|99% of Stripe events projected within 30 s|7 rolling days|Time from `stripe_event.received_at` to the entitlement write|
|Successful deploys|> 95% reach production without rollback|90 days|Deployment records|
|SMS delivery|95% delivered within 30 s|7 rolling days|Twilio delivery status callbacks|

**Error budget:** 99.9% over 30 days is about 43 minutes. The policy, agreed in
advance so it is not negotiated during a bad month:

- **Under 50% of budget spent:** normal feature work.
- **Over 50%:** the next release is reliability work — the specific cause, not
  general hardening.
- **Budget exhausted:** feature work stops. Only fixes, and only after a written
  cause. Deploys continue; freezing deploys during a reliability problem removes
  the tool that fixes it.
- **Two consecutive months over budget:** the targets are wrong or the
  architecture is. Revisit both, in writing.

**External SLA:** none. No contractual commitment is made to members or
partners, and the Terms say so. Internally we hold to the numbers above, which
are deliberately stricter than anything we promise. Note the gap that cannot be
closed by effort: Vercel and Neon each publish 99.9%-class availability, so a
99.9% target on top of both is already optimistic. That arithmetic is the reason
the card verification page — the one thing a partner sees fail in public — is
designed to survive a database outage (§5).

---

## 2. Critical paths

These are the same paths as [ux.md §3](ux.md#3-key-user-flows). Not everything
gets the same investment, and this table is what decides where it goes.

|Path / feature|Criticality|Acceptable downtime|Note|
|-|-|-|-|
|Card verification by QR|**Critical**|0 — it must degrade, not fail|The only failure a stranger watches happen. A partner turning away a real member at a counter costs more trust than an hour of anything else being down|
|Sign-in|**Critical**|5 minutes|Everything else is behind it|
|Stripe webhook ingestion|**Critical**|0 for data loss; 1 hour for processing|Stripe retries for 3 days, so slow processing is survivable and losing an event is not. The endpoint must accept and store even when projection is broken|
|Catalogue browse and search|Important|30 minutes|The daily reason to open the product|
|Registration and SMS verification|Important|1 hour|Blocks growth, not existing members. Depends on a third party we cannot fix|
|Checkout (starting a subscription)|Important|1 hour|Directly revenue-affecting, but a member who cannot pay now pays later|
|Referral send / accept|Deferrable|4 hours|Low volume, no time pressure, moderated anyway|
|Company submission|Deferrable|4 hours|Drafts are saved; a delayed submission costs nothing|
|Staff console|Deferrable|8 hours|Queues wait. The exception is blocking a member during an active abuse incident, which has a documented database-level fallback|
|Marketing site|Deferrable|1 hour|Statically served, so it is the last thing to break|
|Finance dashboards|Deferrable|24 hours|Read-only reporting over data that is not going anywhere|

---

## 3. Failure modes

|Failure|Effect on users|Detection|Response|
|-|-|-|-|
|**Database unavailable**|Member area and staff console return an error page. Marketing stays up (static). Card verification serves the last-known verdict from the edge cache for tokens seen in the last hour, marked "verified a few minutes ago"|Health check `/health/ready` fails; error rate alert within 60 s; Neon status|Neon autoscaling and failover handle most causes without us. If not: check Neon status, fail over to the standby compute, and if the cause is our own runaway query, terminate it and cap the offender|
|**Database slow (connection exhaustion)**|Everything is slow; timeouts on the busiest routes first|p95 latency alert; pool saturation metric|Confirm the pooled endpoint is in use (a direct-endpoint deploy is the usual cause), find the slow statement in `pg_stat_statements`, and lower per-function concurrency to shed load|
|**Stripe API down**|New checkouts fail; existing members are unaffected because entitlements are local|Error rate on outbound Stripe calls; Stripe status page subscription|Show "payments are temporarily unavailable, nothing has been charged". Do not queue and retry a checkout later — a delayed payment surprise is worse than a failed one. Webhooks arriving after recovery reconcile everything|
|**Stripe webhooks not delivered**|Silent. Someone pays and does not get access|Alert when no Stripe event has been received for 6 hours during business hours; the nightly reconciliation reports a divergence|Reconciliation repairs state automatically. Investigate the endpoint's status in the Stripe dashboard; replay from Stripe's event log if needed|
|**Twilio down or rejecting**|Nobody can register or reset a password. Existing members sign in normally|Verification failure-rate alert; Twilio status|Show an honest message and a "notify me when it works" option. There is no second SMS provider at launch — an accepted risk, and the reason sign-in does not require SMS|
|**SMS pumping attack**|No user impact; the bill grows by hundreds of dollars an hour|Alert at 50% of the daily SMS cap, page at 80%|Kill switch disables registration SMS immediately; tighten geographic permissions in Twilio; block the source ranges at Cloudflare; review Fraud Guard settings|
|**Redis unavailable**|Rate limits fall back to database counting; facet counts disappear from the catalogue filter|Error rate on Redis calls|Degrade, do not fail: quotas fall back to durable counts, and the fallback is the stricter direction. Fix at leisure|
|**Inngest down or backed up**|Entitlements lag behind payments; notifications are delayed. Nothing is lost — the outbox holds|Outbox depth alert (> 100 rows or > 10 minutes old)|Outbox drains when service returns. If the outage is long, run the projection in "catch-up" mode manually from the runbook|
|**R2 unavailable**|Partner images do not load; the catalogue still lists and links|Image error rate from real user monitoring|Placeholder images; no user-facing error. Text is what the catalogue is for|
|**Vercel function instance loss**|None — requests route to another instance|Platform-level|No action|
|**Region outage (`us-east-1`)**|Total outage of everything dynamic. Marketing and static assets survive at the edge|Synthetic checks from three regions all fail|Accepted: no automatic cross-region failover. RTO is Neon's regional recovery plus a redeploy — realistically 2–6 hours. Communicate on the status page and social channels. This is the largest accepted risk in the document ([architecture.md §7](architecture.md#7-known-limitations-and-technical-debt))|
|**Bad deploy**|Depends. Worst case: a broken member area|Error rate rises within 2 minutes of a deployment; the deployment dashboard correlates them|Instant rollback (§8). Rollback first, diagnose after — the production instance is not a debugger|
|**Bad migration**|Potentially data loss or a locked table|Migration step fails in CI before traffic shifts; `lock_timeout` aborts a blocking statement|The `down.sql` is tested in CI. Restore from a Neon branch if the migration destroyed data|
|**Traffic spike (press, launch)**|Slower responses, then function concurrency limits, then 5xx|Request rate and latency alerts|Vercel scales automatically; the binding constraint is database connections. Raise the Neon compute ceiling and the pool size — both are configuration, applied without a deploy|
|**Certificate expiry**|Total outage, and an embarrassing one|Expiry alert at 21 days|Vercel renews automatically; the alert exists because "automatic" is a claim, not a guarantee|

**Single points of failure**, including the accepted ones:

1. The PostgreSQL primary. Neon provides failover; there is no second database.
2. The `us-east-1` region.
3. Twilio, for all registration and password reset. No fallback provider.
4. Stripe, for all revenue. Universally accepted risk, no meaningful mitigation.
5. Vercel, for all serving.
6. The single Next.js deployment: a bad deploy takes down member area and staff
   console together.
7. The domain registrar and Cloudflare DNS — the failure nobody rehearses.

---

## 4. Redundancy and failover

|Layer|Redundancy|Failover|Time to recover|Last tested|
|-|-|-|-|-|
|Application|Vercel runs many short-lived instances across zones automatically|Automatic|Seconds|Continuous, implicitly|
|Static assets and marketing|Replicated to every edge location|Automatic|Seconds|Continuous|
|Database|Neon: multi-AZ storage, compute restart on failure, 30-day PITR|Automatic within the region; manual to a restored branch|Under 1 minute for compute; minutes to hours for a restore|_(fill in — first drill scheduled for the week before launch)_|
|Cache (Redis)|None. Deliberate|Not applicable — the system degrades instead|Immediate|To be confirmed by launch owner|
|Object storage|R2 multi-zone, object versioning|Automatic|Seconds|To be confirmed by launch owner|
|Background jobs|Inngest retries with backoff; the outbox is durable in PostgreSQL|Automatic|Minutes|To be confirmed by launch owner|
|DNS|Cloudflare anycast|Automatic|Seconds|To be confirmed by launch owner|

The blank cells are honest: nothing has been tested yet because nothing is
deployed yet. They are filled in during the pre-launch drill and reviewed
quarterly. Untested redundancy is a hypothesis, and writing "automatic" in a
table does not make it true.

---

## 5. Graceful degradation

|When this fails|The system does this|User sees|
|-|-|-|
|Database unreachable|Card verification serves a signed, short-lived cached verdict for recently seen tokens; everything else fails fast rather than hanging|"Card verified — status as of 4 minutes ago". Elsewhere: an honest error page with a reference code|
|Redis unreachable|Rate limits and quotas fall back to durable PostgreSQL counts; facet counts are omitted|Filters work, counts are absent. No error|
|Stripe unreachable|Checkout is disabled; existing entitlements are unaffected because they are local|"Payments are temporarily unavailable — nothing has been charged"|
|Twilio unreachable|Registration and password reset are disabled; sign-in works normally|"We can't send codes right now. Existing members can still sign in"|
|Inngest backed up|Writes still commit; effects lag|"Activating — this can take a few minutes", with the page polling|
|Resend unreachable|Notifications queue; in-product state is authoritative regardless|Nothing. The referral or moderation outcome is visible in the product without the email|
|R2 unreachable|Images fall back to a neutral placeholder|Catalogue works, images are grey|
|Search index stale or broken|Falls back to `ILIKE` prefix matching on name and city|Fewer relevant results, no error|
|Moderation queue overloaded|Nothing degrades; the queue simply lengthens, and its age is visible to staff|"Usually reviewed within 1–3 business days"|

**Resilience patterns in use:**

|Pattern|Where|Settings|
|-|-|-|
|Timeouts|Every outbound call, without exception|Stripe 10 s; Twilio 8 s; Resend 5 s; Redis 1 s; database statement 15 s (5 s on member reads). A call with no timeout is an outage waiting for a slow vendor|
|Total request budget|Every inbound request|20 s hard ceiling, below Vercel's function limit, so we fail with our own message rather than the platform's|
|Retries with backoff|Idempotent outbound calls and all jobs|3 attempts, exponential from 1 s with full jitter. Never on a non-idempotent operation without an idempotency key — which is why every such call has one|
|Circuit breaker|Stripe, Twilio, Resend, R2|Open after 5 failures in 30 s, half-open after 30 s. Prevents a slow vendor from consuming every function slot|
|Bulkhead / isolation|Webhook ingestion is separated from projection by the outbox|The endpoint's only job is verify-store-acknowledge, so nothing downstream can make Stripe retry|
|Kill switches|`signup_enabled`, `sms_enabled`, `referrals_enabled`, `checkout_enabled`, `maintenance_mode`|Database-backed flags, effective within 30 seconds, changeable by `staff_owner` without a deploy. Their existence is why the SMS-pumping response is a click and not a release|

---

## 6. Backup and restore

|Target|Value|Verified|
|-|-|-|
|RPO (maximum acceptable data loss)|5 minutes for the database; 24 hours for the off-vendor dump|_(fill in — at the first drill)_|
|RTO (maximum acceptable recovery time)|1 hour for a logical error (bad migration, accidental delete); 6 hours for a total regional loss|_(fill in — at the first drill)_|
|RPO for subscriptions specifically|0|Stripe holds the truth; the reconciliation job rebuilds our projection regardless of what we lost|

Backup mechanics and the step-by-step restore procedure are in
[data-storage.md §5](data-storage.md#5-backup-and-recovery).

**Last successful restore drill:** _(fill in — none yet. The first is scheduled
for the week before launch and is a launch blocker in
[requirements.md §8](requirements.md#8-acceptance-criteria).)_

Until that date is filled in, the backups are untested and this document says
so rather than implying otherwise.

---

## 7. Incident process

**Severity levels:**

|Level|Meaning|Response time|Who is woken|
|-|-|-|-|
|SEV-1|Complete outage, data loss, a security breach, or card verification failing in public|15 minutes, any hour|Tech lead, then owner|
|SEV-2|A critical path in §2 is down or badly degraded: sign-in, checkout, webhook ingestion|1 hour during 08:00–22:00 local; next morning otherwise|Tech lead|
|SEV-3|Degraded but usable, or a deferrable path is down; a workaround exists|Next business day|Whoever is working|

**On-call rotation:** none — this is a three-person team and pretending
otherwise would be worse than saying so. The arrangement is **best effort by the
tech lead, with alerts routed to a phone for SEV-1 only**, and the owner as the
escalation. This is a real gap and it is named here so the client decides
knowingly: a genuine 24/7 rotation needs at least four engineers, and buying one
is a commercial choice, not an engineering one. It is an open question in
[requirements.md §9](requirements.md#9-open-questions).

**Escalation path:** alert → tech lead (15 min) → owner (30 min) → vendor
support. Vendor escalation paths, account ids and support plan levels are kept
in the runbook, because looking up how to open a Neon ticket during an outage is
15 minutes nobody has.

**Communication:** a status page (Better Stack) on a separate host and separate
DNS from the application, so it survives the outage it describes. Updates every
30 minutes during a SEV-1, even when the update is "still investigating" —
silence is what turns an outage into a reputational event. The owner writes to
members; engineers do not communicate externally during an incident.

**Post-mortem:** required for every SEV-1 and SEV-2, written within 5 working
days, blameless, and structured as: timeline, impact in numbers, root cause,
what made it hard to detect, what made it hard to fix, and dated actions with
named owners. Every action lands in the document that failed to prevent it —
that is the loop that makes this documentation set worth maintaining.

---

## 8. Deployment safety

|Aspect|Approach|
|-|-|
|Deployment strategy|Atomic. Vercel builds the new version, then switches traffic at the alias in one step. No partial rollout at launch — with this traffic volume a canary produces a sample too small to learn from|
|Rollback method and time|Reassign the production alias to the previous deployment: under 60 seconds, no rebuild. The only rollback that is not instant is one behind a migration, which is exactly why the expand/migrate/contract rule exists|
|Database migration safety|Migrations run before traffic shifts and must be backward-compatible with the running version ([data-storage.md §3](data-storage.md#3-schema-and-migrations)). `lock_timeout = 3s` so a migration fails rather than blocking the site. Destructive statements require a second approver on the pull request|
|Pre-deploy gates|Full CI ([testing.md §6](testing.md#6-ci-gates)), plus end-to-end tests against the preview deployment, plus the migration's up/down/up proof|
|Post-deploy verification|Smoke test against production immediately after the alias switch: sign in, load a card, verify a QR token, load the catalogue, receive a test Stripe webhook. Failure triggers an automatic rollback|
|Feature flags|New risky behaviour ships dark and is enabled by flag afterwards, so exposure and deployment are separate events|
|Deploy freeze windows|No deploys after 16:00 local on Friday, or the day before a public holiday, without the owner's approval. Not superstition: the cost of a bad deploy is the time until someone notices, and nobody is watching on a Saturday|
|Who deploys|Merging to `main` deploys to staging automatically. Production is a manual promotion by the tech lead, after the staging smoke test|

---

## 9. Capacity planning

|Resource|Current peak|Limit|Action threshold|
|-|-|-|-|
|Database connections (pooled)|_(fill in at launch)_|10,000 pooled / ~450 direct on Neon Scale|60% sustained → raise the pool, review per-request connection use|
|Database compute|To be confirmed by launch owner|Autoscaling 1–4 CU|70% CPU for 15 minutes → raise the ceiling; sustained → add a read replica|
|Database storage|~0.2 GB|Practically unbounded on Neon|60 GB → begin monthly partitioning of `audit_log`, `payment`, `notification_log`|
|Vercel function concurrency|To be confirmed by launch owner|Account limit, currently 1,000|50% sustained → request an increase before it is needed|
|Vercel bandwidth|—|1 TB included on Pro|70% of the monthly allowance → review image sizes first|
|Redis commands|—|Upstash plan limit|70% → raise the plan; this is a cheap limit to raise|
|Twilio SMS spend|—|**Hard daily cap set in Twilio**|50% of the daily cap → warn; 80% → page and consider the kill switch. This is the only limit whose breach costs money rather than availability|
|Inngest step executions|—|Plan limit|70% → raise the plan|
|Moderation throughput|0|~50 items/day per moderator|Queue p90 age over 3 business days → hire, or introduce auto-approval for trusted senders|

**Autoscaling:** compute scales automatically at Vercel and Neon within their
configured bounds. The bounds are the real capacity decision, and they are set
deliberately rather than left at the maximum — an unbounded autoscaler turns a
traffic spike or a runaway loop into an unbounded invoice.

**Known ceiling.** The first thing to break under sustained growth is the
database connection pool, at roughly 300–500 requests per second sustained,
because serverless concurrency multiplies short-lived connections. That is six
to ten times the projected year-one peak. The fix is ordered and known: raise
the pool size, then move the staff console and marketing reads to a replica,
then cache the catalogue's first page per filter combination. None of these is
architectural, which is the point — the architecture is deliberately boring so
the growth path is boring too.

The second ceiling is human: moderation. Every company and every referral needs
a person. At 50 items per day per moderator, a growth spike stalls in the queue
long before it stresses anything technical — and that is the constraint most
likely to be hit first.
