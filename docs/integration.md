# Integration

> **Status:** In review
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-02
> **Write when:** the first external dependency is added.

Everything this system talks to, and the contract for each conversation — both
the APIs we consume and the ones we expose. How failures of these dependencies
are absorbed is covered in [reliability.md](reliability.md#3-failure-modes).

---

## 1. External dependencies

|Service|Used for|Critical?|Without it|Owner|
|-|-|-|-|-|
|**Stripe**|Subscriptions, checkout, invoices, customer portal, card storage|Yes|No new subscriptions and no renewals. Existing entitlements survive, because they are local. Revenue stops|Owner|
|**Twilio Verify**|SMS one-time codes for registration, password reset and device challenges|Yes|Nobody can register or reset a password. Existing members sign in normally|Tech lead|
|**Twilio Messaging**|Transactional SMS to members without an email address|No|Notifications fall back to in-product state|Tech lead|
|**Neon**|The primary database|Yes|Total outage of everything dynamic|Tech lead|
|**Vercel**|Hosting, CDN, TLS, build and deploy|Yes|Total outage|Tech lead|
|**Upstash Redis**|Rate limits, quotas, facet counts|No|Degrades to durable counting; limits become slower, never absent|Tech lead|
|**Inngest**|Durable background jobs and scheduling|No, for correctness; yes, for timeliness|Entitlements lag and notifications queue. Nothing is lost — the outbox is in PostgreSQL|Tech lead|
|**Cloudflare R2**|Partner images|No|Placeholder images; the catalogue works|Tech lead|
|**Cloudflare DNS + Turnstile**|DNS, bot mitigation on registration|Yes (DNS)|DNS failure is a total outage; Turnstile failure fails open with tighter rate limits|Owner|
|**Resend**|Transactional email|No|Email queues; in-product state is authoritative|Tech lead|
|**Sentry / Axiom / Better Stack**|Errors, logs and metrics, uptime and status page|No|We are blind but serving. Blindness during an incident is bad enough to alert on separately|Tech lead|
|**1Password**|Secret storage of record|No, at runtime|Deployment and rotation are blocked; running systems are unaffected|Owner|

**Vendor SLAs, and where they fall short of our own targets:**

|Vendor|Their commitment|Our dependent target|The gap|
|-|-|-|-|
|Vercel|99.99% on Enterprise; **no contractual SLA on Pro**|99.9% member area|We have no remedy and no promise. Accepted|
|Neon|99.95% on Business; best-effort on Scale|99.9% member area|The database is a single point of failure; our target sits on top of an uncommitted number|
|Stripe|99.99% historical, no contractual SLA on standard accounts|Checkout availability|Accepted universally; no alternative provider is realistic|
|Twilio|99.95% on Verify|Registration|A Twilio outage stops growth, not the club|
|Upstash / R2 / Resend|99.9%-class|Nothing critical|Designed to degrade|

The honest summary: **our 99.9% target is a stack of vendors' 99.9%s, which
multiply to less.** That is why the card verification path — the only one a
stranger watches — is designed to survive a database outage, and why the error
budget policy in [reliability.md §1](reliability.md#1-reliability-targets)
treats a busted budget as a signal to change the architecture rather than to
try harder.

---

## 2. Outbound integrations

### 2.1 Stripe

|Aspect|Detail|
|-|-|
|Purpose|Subscriptions, one-off checkout sessions, customer portal, invoices, refunds|
|Base URL(s)|`https://api.stripe.com` (live and test are distinguished by the key, not the URL — a fact that has caused production charges in test flows elsewhere, so the key's mode is asserted at boot against the environment name)|
|Protocol|REST, official `stripe-node` SDK, API version **pinned** in code and in the dashboard|
|Authentication|Secret key in `STRIPE_SECRET_KEY`; webhook signature with `STRIPE_WEBHOOK_SECRET`. See [security.md §4](security.md#4-secrets-management)|
|Operations used|`checkout.sessions.create`, `billingPortal.sessions.create`, `subscriptions.retrieve/update/cancel`, `customers.create/retrieve/delete`, `prices.create`, `products.create`, `invoices.list`, `events.list` (reconciliation)|
|Timeout|10 s, 1 automatic SDK retry|
|Retry policy|3 attempts, exponential backoff with jitter. **Every mutating call carries an `Idempotency-Key`** derived from our own intent row id, so a retry can never create a second subscription or a second charge|
|Rate limit|100 read/s, 100 write/s in live mode. We are nowhere near it; the reconciliation job pages through with `limit=100` and a small delay|
|Documentation|<https://docs.stripe.com/api>|
|Sandbox available|Yes — test mode plus **test clocks**, which simulate months of billing in seconds. Test clocks are the reason Stripe was chosen over a merchant-of-record alternative; the whole subscription lifecycle is testable in CI|

**Data sent:** member internal id (as `client_reference_id` and in metadata),
email if the member has supplied one, and the plan. **Not sent:** phone number,
display name, card serial, or anything about the catalogue. Confirmed against
the "never leaves the system" list in
[security.md §3](security.md#3-data-protection).

**Failure handling:** checkout creation failing shows "payments are temporarily
unavailable, nothing has been charged" — we do not queue a payment for later.
Subscription reads failing during reconciliation abort the run and alert; a
partial reconciliation is worse than none because it looks complete.

### 2.2 Twilio Verify

|Aspect|Detail|
|-|-|
|Purpose|Generating, delivering, expiring and attempt-limiting SMS one-time codes|
|Base URL(s)|`https://verify.twilio.com/v2`|
|Protocol|REST, official SDK|
|Authentication|Account SID + auth token; a dedicated API key restricted to the Verify service|
|Operations used|`verifications.create`, `verificationChecks.create`|
|Timeout|8 s|
|Retry policy|**No automatic retry on `verifications.create`** — a retry is a second SMS and a second charge. The user retries explicitly, and the 60-second cooldown is what bounds it. `verificationChecks.create` is safe to retry once|
|Rate limit|Twilio's service limits, plus our own tighter ones: 1/60 s per number, 5/hour per number, 20/hour per IP, and a global hourly ceiling that alerts|
|Documentation|<https://www.twilio.com/docs/verify/api>|
|Sandbox available|Yes — test credentials with magic numbers; no SMS is sent and no charge is made|

**Data sent:** the phone number and a channel. Nothing else — no name, no
member id, no message body of our own.

**Why Verify rather than sending our own SMS:** Verify owns code generation,
expiry, attempt counting, delivery-channel fallback and fraud scoring. Building
those ourselves would mean storing codes, which is the one thing we want not to
do — a database compromise then cannot approve a verification.

**Failure handling:** a 429 or 5xx surfaces as "we could not send a code, try
again shortly" and no durable state is created. Twilio's Fraud Guard rejecting a
destination surfaces as the same message; the attempt is logged with the country
for the SMS-pumping metric. Geographic permissions are restricted to countries
we expect, and adding one is a deliberate act.

### 2.3 Resend

|Aspect|Detail|
|-|-|
|Purpose|Transactional email: moderation outcomes, payment failures, referral notifications, security notices|
|Base URL(s)|`https://api.resend.com`|
|Protocol|REST|
|Authentication|API key|
|Timeout|5 s|
|Retry policy|3 attempts with backoff, driven by the job rather than inline — email is never on a user's critical path|
|Rate limit|Plan-dependent; far above our volume|
|Sandbox available|Yes; in preview and staging every message is redirected to a team address|

**Data sent:** email address, member display name, and the message content.
Never a card serial, never a referral client's contact details, never a
one-time code — email is not a verification channel in this product.

### 2.4 Cloudflare R2

|Aspect|Detail|
|-|-|
|Purpose|Storage of partner logos and cover images|
|Protocol|S3-compatible REST, `@aws-sdk/client-s3`|
|Authentication|Access key pair, scoped to one bucket|
|Operations used|`PutObject` (server-side, after re-encoding), `DeleteObject`, presigned `GET` for private originals|
|Timeout|10 s|
|Retry policy|3 attempts; uploads are idempotent because the key is content-addressed|
|Notes|Uploads never go browser-direct. Every image passes through our server for magic-byte validation, re-encoding and EXIF stripping ([security.md §6](security.md#6-application-security-controls)) — a presigned browser upload would skip all three|

### 2.5 Upstash Redis and Inngest

Both are called through their SDKs with a 1-second (Redis) and 5-second
(Inngest) timeout. Neither is authoritative for anything: Redis failure degrades
to durable counting, and Inngest failure leaves work in the outbox until it
returns. Inngest signs its inbound requests, and that signature is verified in
the same way a webhook's is (§4).

---

## 3. Inbound API

|Aspect|Detail|
|-|-|
|Consumers|**Our own frontend only.** No partner API, no public API, no mobile client. This is why there is no versioned REST surface: publishing one would mean maintaining a contract nobody has asked for|
|Style|Next.js Server Actions for everything initiated by our own UI; REST Route Handlers only where an external caller exists|
|Public REST endpoints, in full|`POST /api/webhooks/stripe`, `POST /api/webhooks/twilio/status`, `POST /api/inngest`, `GET /v/{token}` (card verification, on `card.kclub.com`), `GET /health/{live,ready,deep}`. That is the complete list, and adding to it is a reviewed decision|
|Base URL|`https://kclub.com/api`, `https://card.kclub.com`|
|Specification|OpenAPI generated from the Zod schemas of the REST endpoints above, published at `/api/openapi.json` in non-production environments. Server Actions are not in it — their contract is the TypeScript types, checked at compile time|
|Authentication|Session cookie for Server Actions; signature verification for webhooks; none for card verification (the token in the path is the credential) and health checks|
|Authorization|Every Server Action re-derives the actor from the session and calls `assertCan` — being reachable only from an authenticated page is not a control|
|Pagination convention|Cursor-based, `?cursor=<opaque>&limit=<n>`, default 24, maximum 100. Offset pagination is not used: it drifts when rows are inserted and it invites `?limit=100000`|
|Error format|One envelope everywhere|
|Idempotency support|Mutating actions that a user may double-submit accept a client-generated `idempotencyKey`; the key is a unique column, so the database rejects the duplicate rather than the code remembering to|

**Error response shape:**

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many code requests. Try again in 47 seconds.",
    "correlationId": "01J8XQ2M4K7YZ3F0A9B2C1D5E6",
    "details": { "retryAfterSeconds": 47 }
  }
}
```

`code` is a stable machine-readable enum (`VALIDATION_FAILED`, `UNAUTHENTICATED`,
`FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `EXTERNAL_UNAVAILABLE`,
`INTERNAL`). `message` is already localised into the caller's language.
`correlationId` is what the user sees as their reference and what support
searches for. `details` is optional, typed per code, and never contains an
internal identifier, a stack trace or a vendor's raw error string.

---

## 4. Webhooks and events

### Incoming

|Event|Sender|Verification|Idempotency|On failure|
|-|-|-|-|-|
|`checkout.session.completed`|Stripe|HMAC signature with `STRIPE_WEBHOOK_SECRET`, 5-minute tolerance, verified **before** the body is parsed|`stripe_event.id` is the primary key; a duplicate insert conflicts and returns 200|Stripe retries for up to 3 days with backoff|
|`customer.subscription.created` / `.updated` / `.deleted`|Stripe|As above|As above|As above|
|`invoice.paid` / `invoice.payment_failed`|Stripe|As above|As above|As above|
|`charge.dispute.created`|Stripe|As above|As above|Flags the account for staff review; access is not withdrawn automatically|
|SMS delivery status|Twilio|Signature validation with the auth token, plus an allowlist check|Message SID as the key|Ignored on failure — delivery status is telemetry, not state|
|Job invocation|Inngest|Signature verification|The job's own step ids|Inngest retries per its policy|

**The handler contract, identical for all of them:** verify the signature, insert
the event id, write an outbox row, return 200 — and do nothing else. Projection
happens in a worker. This is the single most important design rule in the
integration surface, and it exists because a webhook handler that does real work
will eventually be slow, and a slow handler makes the sender retry, and retries
against a handler that is already half-finished are how double-provisioning
happens.

**Out-of-order delivery** is treated as normal, not exceptional. Stripe does not
guarantee order. Projection is a fold over the current subscription object, and
a `stripe_updated_at` watermark discards anything older than what we have
already applied.

**We re-fetch rather than trust.** For anything that grants access, the worker
retrieves the subscription from the Stripe API rather than reading the webhook
payload's fields, so a forged-but-somehow-valid payload still cannot grant an
entitlement that Stripe does not agree with.

### Outgoing

|Event|Sent to|Retry policy|Delivery guarantee|
|-|-|-|-|
|—|—|—|—|

**We send no webhooks.** There is no partner API and no integration consumer, so
there is nothing to deliver. Recorded explicitly because "we have no outgoing
webhooks" is a fact a future reader will otherwise spend an hour establishing.
When the Business tier's "integrations" promise becomes real, this section is
where the contract goes, and it will need its own decision record.

---

## 5. Error handling and retries

House rules for calling anything over a network, so that each integration does
not invent its own.

|Rule|Value|
|-|-|
|Default timeout|5 s, overridden per vendor in §2. A call without an explicit timeout fails lint|
|Total request budget|20 s per inbound request, enforced by an `AbortSignal` threaded through every outbound call|
|Retry on|Connection errors, timeouts, 429, 502, 503, 504|
|Never retry on|400, 401, 403, 404, 409, 422 — these do not get better; any non-idempotent operation without an idempotency key; and `verifications.create`, where a retry means a second SMS and a second charge|
|Backoff|Exponential from 1 s, factor 2, **full jitter**. Without jitter every client retries in lockstep after an outage and provides the second outage|
|Maximum attempts|3 inline; jobs get 5 across a longer window|
|Circuit breaker threshold|5 failures in 30 s opens the breaker per vendor; half-open probe after 30 s; closes after 2 successes|
|Dead letter destination|Inngest's dead-letter queue, alerting to chat. Rows stay in the outbox with `failed_at` set so they are visible in the database as well as in a vendor's console|
|Poison message handling|A job failing identically 5 times is quarantined rather than retried forever, and the alert names the outbox row id|

---

## 6. Rate limits and quotas

### Limits we are subject to

|Service|Limit|Current usage|Alert at|
|-|-|-|-|
|Stripe API|100 read/s, 100 write/s|Negligible|50%|
|Twilio Verify|Service limits, plus per-number fraud rules|_(fill in after launch)_|—|
|**Twilio spend**|A hard daily cap configured in Twilio, set at 3× the expected daily volume|To be confirmed by launch owner|**50% warn, 80% page**|
|Resend|Plan-dependent daily send limit|Negligible|70%|
|Upstash|Commands/day on plan|To be confirmed by launch owner|70%|
|Vercel|Function concurrency, bandwidth|To be confirmed by launch owner|50% concurrency, 70% bandwidth|
|Neon|Connections, compute hours|To be confirmed by launch owner|60% connections|

The Twilio row is the only one where exceeding the limit costs money rather than
availability, which is why it is the only one with a hard cap and a page.

### Limits we enforce

|Endpoint / scope|Limit|Applies per|Response when exceeded|
|-|-|-|-|
|Request a verification code|1 / 60 s, 5 / hour|Phone number|429 + `Retry-After`, with the remaining seconds in the message|
|Request a verification code|20 / hour|IP address|429 + `Retry-After`|
|Request a verification code|Global hourly ceiling|Whole system|429, plus an alert — this one is a spend control|
|Submit a verification code|5 attempts|Verification|The verification is destroyed; a new code must be requested|
|Sign in|5 / minute, then escalating lockout (3 → 1 s, 5 → 30 s, 10 → 15 min)|Account, and separately per IP|429; the member is notified after the lockout threshold|
|Password reset|3 / hour|Account|429|
|Card verification lookup|30 / minute|IP address|429. Deliberately generous — a partner scanning many cards at an event is legitimate — but bounded, because this endpoint is the enumeration surface|
|Catalogue search|60 / minute|Member|429|
|Send a referral|**10 / 24 h per sender; 3 / 24 h per sender-recipient pair**|Member and pair|Blocked in the UI before submission with the reset time shown; 409 server-side if attempted anyway (FR-073)|
|Submit a company|3 / day|Member|429|
|Image upload|10 / hour, 5 MB each|Member|429 / 413|
|Staff console mutations|300 / minute|Staff user|429 — a limit against a runaway script, not against a person|
|Any authenticated request|600 / minute|Session|429|

Limits are sliding-window counters in Redis. When Redis is unavailable the
business-critical ones (SMS, referrals) fall back to a durable PostgreSQL count
and the rest fail open with a warning — the two categories are chosen so that
losing the cache never makes a spend limit or a legal quota disappear.

---

## 7. Versioning and change management

**Our API versioning scheme:** none, and deliberately. The only consumer is our
own frontend, deployed atomically with the server, so a contract version would
be ceremony. The two exceptions that are genuinely externally observable are
versioned by URL because they will outlive a release: the card verification URL
(`/v/{token}` — printed into QR codes that live in people's phones and possibly
on paper, and therefore effectively permanent) and the webhook endpoints. **A QR
token's URL shape can never break.** That is the one true backward-compatibility
obligation in this system, and it is worth stating loudly because it is easy to
forget while renaming a route.

**Breaking change policy:** internally, none needed. Externally, a change to the
verification URL shape or its response requires reissuing every card, which is
not a change — it is a migration with a communication plan.

**Stripe API version:** pinned in code and in the dashboard, upgraded
deliberately once a quarter after reading the changelog, tested against test
clocks, never floating. An unpinned Stripe version means the vendor deploys to
our production on their schedule.

**Deprecation process:** for anything we ever expose externally — announce,
support both for 90 days, log usage of the old path, and remove only when that
log is empty for 30 days.

**Tracking vendor changes:** the tech lead subscribes to the Stripe, Twilio,
Vercel and Neon changelogs and status pages; status page changes post into the
team chat automatically. This is a named responsibility rather than an
expectation, because "someone will notice the deprecation email" is how an
integration breaks on a Sunday.

---

## 8. Testing integrations

|Service|Test approach|Sandbox credentials|Contract verification|
|-|-|-|-|
|Stripe|Test mode plus **test clocks** in integration tests; the Stripe CLI forwards real test-mode webhooks locally. The full lifecycle — subscribe, renew, fail, dun, recover, cancel, lapse — runs in CI against Stripe's own test environment, not a mock|1Password, injected into CI as a secret|The pinned API version is asserted at boot; a fixture recorded from the live API is diffed weekly against the sandbox to catch drift|
|Twilio Verify|Twilio test credentials with magic numbers in integration tests; a mock in unit tests; in preview and staging, SMS is sent only to an allowlist of team numbers|1Password|A weekly smoke test sends one real code to a team number in staging — the only way to prove the A2P registration is still live|
|Resend|Redirected to a team address in every non-production environment|1Password|Visual check of each template per release|
|R2|MinIO in Docker locally and in CI; the real bucket in staging|—|Same S3 client, so the contract is the SDK's|
|Redis|Real Redis in Docker; never mocked, because the behaviour under expiry is the thing being tested|—|—|
|Inngest|Local dev server in development and CI|—|—|

**Nothing in the unit test suite reaches the internet.** Integration tests that
do are tagged and run in a separate CI job, so a vendor outage cannot block a
pull request that has nothing to do with them — it turns the job amber and
reports, rather than failing the build. The end-to-end suite runs against the
preview deployment with all vendors in sandbox mode.

**The gap we accept:** every vendor is in sandbox mode until production. Live
Stripe behaviour (Radar rules, real declines, real 3D Secure challenges) and
live SMS deliverability to real carriers cannot be proven before launch. That is
the reason for the post-deploy smoke test in
[reliability.md §8](reliability.md#8-deployment-safety) and for treating the
first week of production as a supervised period rather than a finished project.
