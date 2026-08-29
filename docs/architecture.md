# Architecture

> **Status:** In review
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-02
> **Write when:** the system has more than one moving part.

How the system is structured, how data moves through it, and why it is shaped
this way. The technologies these components are built from are listed in
[technology.md](technology.md).

---

## 1. System context

KCLUB is one deployed application serving three audiences over three hostnames,
plus a small set of asynchronous workers. Everything inside the boundary is
ours; identity verification, payment and delivery are bought.

Personal data crosses the boundary in exactly four directions: phone numbers go
to Twilio to be verified, billing identity and payment details go to Stripe,
notification addresses go to Resend, and partner-supplied images go to
Cloudflare R2. Nothing else leaves — in particular, no member data is sent to
any analytics or advertising service.

```text
   ┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
   │  Visitor   │     │   Member   │     │  Partner   │     │   Staff    │
   │  (guest)   │     │            │     │   owner    │     │            │
   └─────┬──────┘     └─────┬──────┘     └─────┬──────┘     └─────┬──────┘
         │ browse           │ card,            │ listing,         │ moderate,
         │ verify a card    │ catalogue        │ referrals        │ administer
         │                  │                  │                  │
   ┌─────▼──────────────────▼──────────────────▼──────────────────▼─────┐
   │                                                                    │
   │                          KCLUB  (one deployment)                   │
   │        kclub.com  ·  admin.kclub.com  ·  card.kclub.com            │
   │                                                                    │
   └──┬─────────┬──────────┬──────────┬──────────┬──────────┬───────────┘
      │         │          │          │          │          │
      ▼         ▼          ▼          ▼          ▼          ▼
  ┌───────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐
  │Twilio │ │ Stripe │ │ Neon   │ │Upstash │ │Inngest │ │Cloudflare│
  │Verify │ │Billing │ │Postgres│ │ Redis  │ │  jobs  │ │    R2    │
  └───────┘ └────────┘ └────────┘ └────────┘ └────────┘ └──────────┘
       SMS codes  ▲ webhooks           rate       durable    images
                  │                    limits     workflows
                  └─── Stripe → /api/webhooks/stripe
```

External systems and their contracts are documented in
[integration.md](integration.md).

---

## 2. Components

The system is a **modular monolith**: one deployable unit, with module
boundaries enforced in the codebase rather than by the network. Modules
communicate by calling each other's published functions, never by reaching into
each other's tables. A module owns its tables; another module that needs the
data asks for it.

The rule that makes this real rather than aspirational: a lint rule forbids
importing from `modules/*/internal/**` outside the owning module, and forbids
any database call outside `src/data`. Without enforcement, a modular monolith
becomes a monolith within one sprint.

|Component|Responsibility|Owns|Depends on|
|-|-|-|-|
|`web/marketing`|Renders the public, indexable site and the curated partner showcase|Nothing|`catalogue` (read-only, published entries only)|
|`web/member`|Renders the authenticated member area and its interactions|Nothing|`identity`, `membership`, `catalogue`, `billing`, `referrals`|
|`web/admin`|Renders the staff console|Nothing|Every module, through explicitly authorised use cases|
|`web/verify`|Serves the public card verification page|Nothing|`membership` (one narrow read)|
|`identity`|Establishes and proves who a member or staff user is|Members, staff users, credentials, sessions, verification attempts, devices|Twilio Verify, `audit`|
|`membership`|Issues, displays, revokes and reissues membership cards, and holds the member's tier|Cards, QR tokens, tier state|`identity`, `billing` (tier), `audit`|
|`catalogue`|Holds partner companies and answers searches over the published ones|Companies, categories, countries, cities, showcase ranks, search index|`billing` (publication depends on an active listing), `moderation`|
|`moderation`|Runs the review queues and records every decision|Submissions, review decisions, rejection reasons|`catalogue`, `referrals`, `audit`|
|`billing`|Translates Stripe's world into the club's entitlements|Subscriptions, plans and prices, payments, processed Stripe events|Stripe, `audit`, outbox|
|`referrals`|Carries a client introduction from one partner to another, under quota and consent|Referrals, consent attestations, quota counters|`catalogue`, `moderation`, `billing` (VIP check), `audit`|
|`notifications`|Delivers a message in the recipient's language over the right channel|Templates, delivery log|Resend, Twilio Messaging|
|`audit`|Records what a staff user or the system did, permanently|Audit log|Nothing (deliberately — it must not be able to fail because of another module)|
|`platform`|Cross-cutting machinery: authorization, rate limiting, outbox, feature flags, i18n|Outbox table, flags|Upstash, Inngest|

### Component diagram

```text
                        ┌──────────────────────────────────────┐
   HTTP  ──────────────▶│  web/marketing  web/member           │
                        │  web/admin      web/verify           │   presentation
                        └───────────────┬──────────────────────┘
                                        │ use cases only
                        ┌───────────────▼──────────────────────┐
                        │              domain modules          │
                        │                                      │
                        │  identity ─▶ membership ◀── billing  │
                        │      │            │           ▲      │   domain
                        │      │       catalogue ───────┘      │
                        │      │            ▲                  │
                        │      │            │                  │
                        │      └──▶ referrals ──▶ moderation   │
                        │                 │            │       │
                        │            notifications   audit     │
                        └───────────────┬──────────────────────┘
                                        │ src/data  (the only place SQL exists)
                        ┌───────────────▼──────────────────────┐
                        │   PostgreSQL (Neon)   ·   Redis      │   data
                        │   R2 (objects)        ·   outbox     │
                        └───────────────┬──────────────────────┘
                                        │ outbox dispatch
                        ┌───────────────▼──────────────────────┐
                        │  Inngest workers                     │
                        │  · stripe event projection           │
                        │  · entitlement expiry sweep          │
                        │  · nightly Stripe reconciliation     │
                        │  · referral expiry, dunning, digests │   async
                        └──────────────────────────────────────┘

   Stripe ──webhook──▶ /api/webhooks/stripe ──▶ record event ──▶ outbox ──▶ worker
```

**Why one deployment.** Three engineers, one database, and a domain whose parts
are tightly coupled by design — a card's tier depends on billing, a company's
publication depends on billing and moderation. Splitting this into services
would replace function calls with network calls and local transactions with
distributed ones, buying independent scaling that the traffic in
[requirements.md §5.3](requirements.md#53-scalability) does not need. Recorded
in [decisions/0001-nextjs-monolith-on-vercel.md](decisions/0001-nextjs-monolith-on-vercel.md).

---

## 3. Key flows

### 3.1 Registration, verification and card issue

The first flow every member takes, and the one with the most ways to fail.

```text
Visitor            web/member          identity        Twilio Verify     membership
   │  phone+password    │                  │                 │               │
   ├───────────────────▶│                  │                 │               │
   │                    │ rate-limit check │                 │               │
   │                    ├─────────────────▶│                 │               │
   │                    │                  │ start verify    │               │
   │                    │                  ├────────────────▶│               │
   │                    │                  │                 │──SMS──▶ phone │
   │  "enter the code"  │◀─────────────────┤                 │               │
   │◀───────────────────┤                  │                 │               │
   │  6-digit code      │                  │                 │               │
   ├───────────────────▶├─────────────────▶│ check code      │               │
   │                    │                  ├────────────────▶│               │
   │                    │                  │◀── approved ────┤               │
   │                    │                  │                 │               │
   │                    │        ┌─────────▼─────── one transaction ─────────▼──┐
   │                    │        │ member.status = active                       │
   │                    │        │ credential stored (argon2id)                  │
   │                    │        │ card issued: serial + verify token (hashed)  │
   │                    │        │ legal versions accepted recorded             │
   │                    │        │ outbox: welcome notification                 │
   │                    │        └──────────────────────────────────────────────┘
   │  session + card    │                                                        │
   │◀───────────────────┤                                                        │
```

1. The visitor submits a phone number in E.164 form and a password. The number
   is normalised and checked against the rate limits in FR-003 before anything
   is sent.
2. A _pending_ member row is created. It is invisible to every other user and to
   every query outside `identity` until verification succeeds.
3. Twilio Verify sends the code and owns its lifetime, attempt count and fraud
   scoring. We store no code, only the verification SID.
4. On approval, one database transaction activates the member, stores the
   password hash, issues the card and its verification token, records which
   version of each legal document was accepted, and writes the welcome
   notification to the outbox. Either all of it happens or none of it does.
5. The session cookie is issued and the member lands on their card.

**Failure behaviour.** Twilio unreachable or over quota → the code request fails
with "we could not send a code, try again in a minute"; no member row is
activated and nothing is charged. Wrong code → attempts remaining are shown; on
the fifth failure the verification is destroyed and a new code must be
requested. Abandoned midway → the pending member row is deleted after 24 hours
by a sweep, so the phone number is free to register again. Card issue failing
inside the transaction rolls back the activation, which is why it is inside the
transaction: a verified member without a card is a support ticket, a retryable
error is not.

**The rate limit is a spend control, not just an abuse control.** SMS pumping —
an attacker cycling premium-rate numbers to earn revenue share — is the single
most likely way this system loses money to fraud. Twilio Verify's Fraud Guard
plus our own per-number, per-IP and global hourly ceilings are what bound it,
and the global ceiling alerts before it is reached
([observability.md §7](observability.md#7-alerting)).

### 3.2 Subscription purchase and entitlement

The flow where a defect is unrecoverable, so it is designed around one rule:
**the product never learns anything about money from the browser.**

```text
Member        web/member        Stripe Checkout        /api/webhooks/stripe      billing
  │  "Go VIP"     │                    │                        │                  │
  ├──────────────▶│ create session     │                        │                  │
  │               ├───────────────────▶│                        │                  │
  │◀── redirect ──┤                    │                        │                  │
  │  pays on Stripe-hosted page ──────▶│                        │                  │
  │                                    │  customer.subscription │                  │
  │                                    │  .created / .updated   │                  │
  │                                    ├───────────────────────▶│                  │
  │                                    │                  verify signature         │
  │                                    │                  INSERT stripe_event ──┐  │
  │                                    │                  (id PRIMARY KEY)      │  │
  │  redirected back to /vip/thanks    │                    conflict? → 200, stop │
  │  which shows "activating…"         │                        │                  │
  │                                    │                   outbox row ───────────▶ │
  │                                    │                        │      project state
  │  page polls entitlement, flips     │                        │      grant VIP
  │  to "active" within ~2 s ◀─────────────────────────────────────────  audit    │
```

1. The member clicks upgrade. The server creates a Stripe Checkout Session with
   the current price for the plan and a `client_reference_id` binding it to the
   member.
2. Payment happens entirely on Stripe. We never see card data
   ([requirements.md §5.5](requirements.md#55-compliance-and-legal), PCI SAQ-A).
3. Stripe posts the event. The handler verifies the signature, inserts the
   event id as a primary key — a duplicate delivery collides and returns `200`
   without doing anything — writes an outbox row, and returns within its budget.
   Projection happens in the worker, so a slow projection can never cause Stripe
   to retry.
4. The worker projects Stripe's subscription state onto our entitlements. It is
   written as a **fold over state, not a sequence of deltas**: given the
   subscription object, compute what the entitlement should be and store that.
   Out-of-order delivery is therefore harmless — an older event recomputes an
   older-but-consistent state and is discarded by the `stripe_updated_at`
   watermark.
5. The success page polls its own entitlement. It never asserts success from the
   redirect, because a redirect proves only that a browser followed a link.

**Failure behaviour.** Webhook not delivered → the nightly reconciliation job
compares every active Stripe subscription against local state and repairs the
difference, alerting on any repair, because a repair means the primary path
failed. Worker fails → Inngest retries with backoff; after the final attempt the
job lands in the dead-letter queue and pages. Member pays and the whole
projection pipeline is down → the member sees "activating, this can take a few
minutes"; access appears when the pipeline recovers, and nothing is lost because
Stripe holds the truth. Card declined at renewal → dunning per FR-056; access
survives the 14-day grace period, the subscriber is warned three days before it
ends, and then the entitlement expiry sweep removes it.

### 3.3 Partner onboarding to publication

Three gates, in a fixed order: validity, money, human judgement
([ADR 0019](decisions/0019-payment-before-moderation.md)).

1. The member completes the four-step form. Each step is validated against the
   same Zod schema the server uses; drafts are persisted per step so a lost
   connection does not cost the applicant their work.
2. On submission, the company is created with status `pending_review` and a
   moderation item is queued. It is not visible to any member.
3. Submission hands straight off to listing checkout, because that is the moment
   the applicant's intent is highest. Abandoning it costs nothing: the
   application is already saved and stays payable from Profile → Companies.
4. A moderator approves or rejects with a reason. Both outcomes are written to
   the audit log and to the immutable decision record; the applicant is notified
   in their own language. **A rejection cancels the listing subscription and
   refunds the last invoice** — the gate that money passed first must be undone
   when judgement fails, or we are holding payment for a listing that will never
   appear.
5. Approval sets status `approved` — **not** `published`. Publication requires
   an active listing subscription, and that check lives in one place
   (`catalogue.canBePublished`) rather than being repeated at each call site.
6. On the listing subscription becoming active, the projection worker publishes
   the company. If it later lapses, the entitlement sweep unpublishes it. If
   payment is recovered inside the grace period, it republishes — the same code
   path, driven by the same state.

**Failure behaviour.** A company edited after publication keeps its live version
visible while the edited version waits in the queue, so moderation latency never
blanks a paying partner's listing. If moderation and billing disagree — approved
but unpaid, or paid but rejected — the company stays unpublished; the two
conditions are ANDed, and neither can override the other. Reordering the gates
changed which of the two arrives first, never that both are required.

### 3.4 Client referral

The flow with the most legal weight per row of data, because it moves a third
party's contact details between two businesses.

1. Sender must be VIP **and** own a published company. Both are checked in the
   domain layer, not in the UI.
2. The form collects the client's name, one contact channel, the service needed
   and an optional note — and refuses to store anything else (FR-071).
3. The sender attests that the client consented. The attestation text, its
   version, the timestamp and the sender's identity are stored beside the
   referral; without it the referral cannot be created.
4. Quota check: 10 per rolling 24 hours per sender, 3 to any one recipient. The
   counters are in Redis, with the durable record in PostgreSQL — Redis being
   empty makes the check stricter, never looser.
5. The referral enters moderation. Only on approval is the recipient notified,
   and the client's contact details stay encrypted and hidden until the
   recipient accepts.
6. Decline, expiry after 14 days, or staff rejection all delete the contact
   details within 24 hours; the referral shell remains for the audit trail.

**Failure behaviour.** Notification delivery failing does not fail the referral —
it is queued and retried, and the recipient sees it in the console regardless.
Redis unavailable → quota falls back to a PostgreSQL count over the last 24
hours, slower but correct; there is no path where quotas are skipped.

---

## 4. Data flow and ownership

Exactly one component is authoritative for each fact. Where a second copy
exists, it is a projection that can be rebuilt, and it is marked as such.

|Data|Created by|Stored in|Authoritative owner|
|-|-|-|-|
|Phone number, password hash, sessions|`identity`|PostgreSQL|`identity`|
|Phone _verification_ attempt and outcome|Twilio Verify|Twilio (code), PostgreSQL (outcome only)|Twilio during the attempt; `identity` afterwards|
|Membership card, serial, QR token|`membership`|PostgreSQL|`membership`|
|Member tier (free / VIP)|`billing` projection|PostgreSQL, on the member row|`billing` — `membership` reads it, never writes it|
|Company, discount, showcase rank|Partner owner and staff|PostgreSQL|`catalogue`|
|Company publication state|`catalogue`, from moderation ∧ billing|PostgreSQL|`catalogue`|
|Moderation decisions|`moderation`|PostgreSQL, append-only|`moderation`|
|Subscription, invoice, payment|**Stripe**|Stripe (truth), PostgreSQL (projection)|**Stripe.** Ours is a cache that reconciles nightly and is never edited by hand|
|Entitlements (what a subscription unlocks here)|`billing`|PostgreSQL|`billing` — this is ours, not Stripe's|
|Plan prices|`staff_owner`, mirrored into Stripe Price objects|PostgreSQL + Stripe|PostgreSQL for what we charge; Stripe for what was charged|
|Referral and consent attestation|`referrals`|PostgreSQL (contact details encrypted)|`referrals`|
|Audit log|Every module|PostgreSQL, append-only, no `UPDATE`/`DELETE` grant|`audit`|
|Rate-limit counters|`platform`|Redis|Redis. Loss degrades throughput, never correctness|
|Partner images|Partner owner|Cloudflare R2|`catalogue` holds the key; R2 holds the bytes|
|Interface translations|Engineering|Repository (`messages/*.json`)|Git|

**The one deliberate duplication** is subscription state. Stripe is the system
of record; we keep a local projection because every page in the member area
needs to know whether the viewer is VIP, and a synchronous Stripe call on every
request would be both slow and a hard dependency on a third party's uptime. The
projection is reconciled nightly and any divergence alerts, because a divergence
means an event was lost.

Storage details are in [data-storage.md](data-storage.md).

---

## 5. Cross-cutting concerns

|Concern|Approach|Detail in|
|-|-|-|
|Authentication / authorization|Session cookie resolved once per request into an `Actor`; every domain use case opens with `assertCan(actor, action, subject)` and throws otherwise. Route placement and hidden UI are never the control|[security.md](security.md)|
|Tenancy of data access|All member-scoped reads go through repository functions that take the actor and apply the ownership filter internally. There is no repository function that returns a list of members|[security.md §2](security.md#2-authentication-and-authorization)|
|Error handling|Domain code throws typed errors (`NotFound`, `Forbidden`, `Conflict`, `RateLimited`, `Validation`, `ExternalUnavailable`). One boundary handler maps them to HTTP status, a user-facing message in the right language, and a Sentry event. Internal detail never reaches the client|—|
|Idempotency|Externally triggered writes carry a key: Stripe event id, Twilio SID, or a client-generated key on retryable actions. The key is a primary key, so the database enforces it rather than the code|[integration.md §5](integration.md#5-error-handling-and-retries)|
|Transactional messaging|The outbox pattern: domain writes and the intent to notify or enqueue commit in the same transaction; a dispatcher picks them up. No side effect is fired inside a transaction that may still roll back|[data-storage.md §6](data-storage.md#6-consistency-and-transactions)|
|Logging and tracing|Structured JSON, one `correlation_id` per request propagated into jobs, OpenTelemetry spans across HTTP, database and outbound calls|[observability.md](observability.md)|
|Configuration|Environment variables validated by a Zod schema at boot; the process refuses to start if one is missing or malformed. Business configuration (prices, quotas, prohibited categories) lives in the database and is editable by staff|—|
|Feature flags|Simple database-backed flags evaluated on the server, used as kill switches for referrals, sign-up and SMS sending|[reliability.md §5](reliability.md#5-graceful-degradation)|
|Caching|Static and marketing content at the CDN; catalogue facet counts in Redis with a 5-minute TTL; nothing member-specific is cached anywhere shared|[data-storage.md §7](data-storage.md#7-caching)|
|Rate limiting|Sliding window in Redis, applied at the edge for coarse limits and in the domain for business limits (SMS, referrals)|[integration.md §6](integration.md#6-rate-limits-and-quotas)|
|Internationalisation|Locale in the URL segment; server-rendered messages; every user-facing string, email and SMS resolved from a catalogue with a CI check for missing keys|[ux.md §9](ux.md#9-content-and-tone)|
|Time|Everything stored in UTC as `timestamptz`. Billing periods come from Stripe. Display converts to the viewer's timezone; no business rule depends on local midnight|—|
|Money|Integer minor units plus an ISO-4217 currency code. No floating point touches an amount, anywhere|—|

---

## 6. Architectural decisions

The decisions themselves are recorded in [decisions/](decisions/) — one file
each, written when the decision is made and never rewritten afterwards. This
section is only an index, so that a reader of the architecture can see what
shaped it without leaving the page.

|#|Decision|Status|
|-|-|-|
|[0001](decisions/0001-nextjs-monolith-on-vercel.md)|One Next.js modular monolith on Vercel, rather than separate services|Accepted|
|[0002](decisions/0002-postgresql-on-neon-with-drizzle.md)|PostgreSQL on Neon with Drizzle as the only datastore|Accepted|
|[0003](decisions/0003-self-hosted-phone-authentication.md)|Self-hosted phone authentication, with SMS codes bought from Twilio Verify|Accepted|
|[0004](decisions/0004-stripe-billing-as-system-of-record.md)|Stripe is the system of record for subscriptions; entitlements are projected from webhooks|Accepted|
|[0005](decisions/0005-no-member-directory.md)|No member directory — enforced in the data-access layer, not by convention|Accepted|
|[0006](decisions/0006-postgres-full-text-search.md)|PostgreSQL full-text search for the catalogue, no separate search engine|Accepted|
|[0007](decisions/0007-staff-identities-separate.md)|Staff identities are separate from member identities|Accepted|
|[0008](decisions/0008-durable-background-jobs-with-inngest.md)|Durable background jobs with Inngest, fed by a transactional outbox|Accepted|
|[0009](decisions/0009-referral-data-minimisation.md)|Referrals capture consent and minimise, encrypt and expire client contact data|Accepted|
|[0010](decisions/0010-no-own-a2p-registration-with-twilio-verify.md)|Verification codes go through Twilio Verify's registered sender pool; no KCLUB A2P 10DLC registration|Accepted|
|[0011](decisions/0011-company-drafts-in-their-own-table.md)|Company application drafts live in their own table, not as companies with a `draft` status|Accepted|
|[0012](decisions/0012-postpone-phone-verification-turnstile-gate.md)|SMS phone verification postponed; registration gated by Cloudflare Turnstile instead|Accepted|
|[0013](decisions/0013-partner-logos-as-external-urls.md)|Partner logos are member-supplied external URLs, not uploaded files|Accepted|
|[0014](decisions/0014-no-notification-log-table.md)|No dedicated notification log table|Accepted|
|[0015](decisions/0015-password-reset-deferred-to-client.md)|Password reset stays unbuilt until the client answers the account-recovery question|Accepted|
|[0016](decisions/0016-totp-seeds-encrypted-and-reissued.md)|Staff TOTP seeds are encrypted at rest, bound to their member, and the existing ones are discarded|Accepted|
|[0017](decisions/0017-project-entitlements-after-the-webhook-response.md)|Project the entitlement in the webhook's own invocation, after the response has been sent|Accepted|
|[0018](decisions/0018-staff-assisted-password-reset.md)|Recover accounts through a staff-performed reset, as a stopgap|Accepted|
|[0019](decisions/0019-payment-before-moderation.md)|Take payment for a listing before moderation, not after|Accepted|
|[0020](decisions/0020-member-inbox.md)|Give every member an in-product inbox, and demote email to a delivery channel|Accepted|
|[0021](decisions/0021-member-avatar-upload.md)|Member avatars are uploaded through a server-side re-encode pipeline into R2|Accepted|
|[0022](decisions/0022-company-photo-gallery.md)|Companies get a KCLUB-hosted photo gallery through the avatar upload pipeline|Accepted|
|[0023](decisions/0023-company-logo-upload.md)|Company logos move onto the upload pipeline, superseding ADR 0013|Accepted|
|[0024](decisions/0024-onboarding-media-staging.md)|Onboarding media is staged under the applicant's draft and promoted on submission|Accepted|
|[0025](decisions/0025-city-lookup-from-countrystatecity.md)|The onboarding city picker reads city names from the CountryStateCity API|Accepted|
|[0026](decisions/0026-dev-database-is-a-neon-branch-rebuilt-from-migrations.md)|The dev database is a Neon branch rebuilt from migrations, and the database says which environment it is|Proposed|

---

## 7. Known limitations and technical debt

|Limitation|Impact|Trigger to address it|
|-|-|-|
|Single region (`us-east-1`) for compute and data|EU and Asian members pay 100–250 ms extra on every dynamic request; a regional outage is a full outage|More than 25% of active members outside the Americas, or the availability target is missed twice by a regional event|
|One PostgreSQL primary, no read replica at launch|A long analytical query in the staff console can affect member traffic; no read scaling headroom|Sustained database CPU above 60%, or the finance dashboard exceeding 2 s|
|Entitlements are eventually consistent (seconds behind Stripe)|A member can briefly see "activating" after paying|Only if it produces support volume; the alternative — synchronous Stripe reads — is worse|
|Phone-only identity with no second recovery channel|Every lost-phone case is manual support work, and support becomes an account-takeover vector|More than 5 recovery cases a week|
|Human moderation on every submission and referral|Throughput is bounded by staff hours; a growth spike stalls in the queue|Queue age p90 exceeds 3 business days|
|Search is PostgreSQL full-text with no synonyms or typo tolerance|"attorny" finds nothing; cross-language search is per-language, not unified|Catalogue over ~100,000 rows, or search-with-no-results above 15%|
|No CDN caching of member-area responses|Every authenticated page view hits the database|Read traffic above ~200 rps sustained|
|Staff console lives in the same deployment as the member area|A bad deploy takes down both; blast radius is the whole product|Never, probably — the isolation is not worth a second deployment at this size|
|No formal disaster-recovery region|RTO depends on Neon's regional recovery|The club takes on a customer with a contractual RTO|
|Referral contact data is encrypted with one application-held key|Key compromise exposes all pending referral contacts|Move to per-record envelope encryption with KMS if referral volume exceeds ~10,000/month|

---

## 8. Future direction

Three changes are anticipated, and today's design is arranged so that none of
them is a rewrite:

**A partner-facing API or a native application.** The `src/domain` layer already
has no knowledge of HTTP or React, so exposing it over REST is adding an
adapter, not extracting a service. This is the reason for the layering, which
otherwise looks like ceremony at this size.

**A third plan tier ("Business", up to 10 seats).** Plans, prices and
entitlements are data, not code branches. Adding a tier is a row plus an
entitlement mapping; multi-seat membership is the part that needs real work,
because the schema currently assumes one member per subscription.

**Read scaling and a second region.** Neon read replicas come first and require
only a second connection string plus routing read-only queries to it. A second
region is a much larger step and is deliberately deferred until the member
distribution justifies it.

What is **not** anticipated: microservices, an event-sourced core, or
multi-tenancy. Each would be a response to a problem this product does not have,
and adopting one early would cost the schedule the club cannot afford.
