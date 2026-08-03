# 0003. Self-host authentication, buying only SMS code delivery from Twilio Verify

> **Status:** Accepted
> **Date:** 2026-08-02
> **Deciders:** Tech lead, client

## Context

The client requires phone-number identity and explicitly rejects email and
social sign-in: a member registers with a phone number and a password and
verifies with an SMS code. Staff sign in separately and must have two-factor
authentication.

Identity is normally the first thing a small team buys rather than builds, and
the arguments for buying are strong: Clerk, Auth0 and Stytch all support phone
sign-up, SMS codes, TOTP and session management out of the box, and would save
perhaps two to three weeks of the fifteen-week schedule.

The counter-pressure is what this specific product is. Its promise is that the
set of people in the club is never disclosed. Basic membership is free, so the
member table will be much larger than the paying population. And the phone
number is both the identifier and the only recovery channel, so the mechanics of
recovery, device trust and rate limiting are product decisions with security
consequences, not infrastructure details.

## Decision

We will self-host authentication using `better-auth` against our own PostgreSQL
schema — credentials, sessions, devices and staff TOTP all in our database — and
buy only the delivery, expiry, attempt-limiting and fraud-scoring of SMS codes
from Twilio Verify.

## Rationale

The asset this product exists to protect is the member list. Placing it in a
third party's database means the club's core promise depends on a vendor's
breach posture, their subprocessor list, their data-retention defaults and their
willingness to respond to a GDPR erasure request on our timetable. That is a
strange thing to outsource when the product is "we do not disclose who is in the
club".

The economics point the same way. Per-monthly-active-user pricing scales with a
free tier that generates no revenue: at 25,000 members, a $0.02/MAU identity
vendor costs more per month than the entire rest of the platform. We would be
paying most for exactly the members who pay us nothing.

The line we draw — build the session layer, buy the code layer — is drawn where
the risk actually is. Generating, delivering, expiring and attempt-limiting
one-time codes is a well-solved problem with a genuinely hard part we do not
want: SMS-pumping fraud detection, carrier routing and channel fallback. Twilio
Verify does that and, crucially, means **we never store a code** — so a database
compromise cannot approve a verification. Sessions, ownership, device trust and
revocation are the parts entangled with our authorization model, and those we
keep.

Opaque database-backed sessions rather than JWTs follow from FR-010: a blocked
member's sessions must die within 60 seconds. A stateless token cannot be
killed, only waited out.

## Alternatives considered

|Option|Why not|
|-|-|
|Clerk|Excellent developer experience and would save two to three weeks. Puts the member table — the asset — in a third party; per-MAU pricing scales against a free tier; customising recovery and device-trust policy means working against the product rather than with it|
|Auth0 / Okta|Enterprise-grade and priced accordingly. Phone-first passwordless-plus-password flows are awkward; heavy for a consumer product with one identity type|
|Stytch|Strong phone-first primitives and closest to a fit. Same fundamental objection: member identity leaves our database|
|Firebase Authentication|Would place member identity in Google's control, which sits badly beside a privacy promise, and pulls a second SDK and console into a stack that has neither|
|Supabase Auth|Would make sense only if we adopted Supabase wholesale ([0002](0002-postgresql-on-neon-with-drizzle.md))|
|Fully hand-rolled, including SMS code generation|Saves a vendor and adds the obligation to store codes, implement attempt-limiting and expiry correctly, and detect SMS pumping ourselves. Storing codes is precisely the risk we are avoiding|
|`better-auth` vs. Lucia vs. NextAuth/Auth.js|Lucia is deprecated as a library. Auth.js is built around OAuth providers and fits phone-plus-password awkwardly. `better-auth` has first-class phone-number, TOTP and session-management plugins and keeps all data in our schema|

## Consequences

**This makes easy:** owning the member table outright; killing a session in one
second; shaping recovery, device trust and rate limiting as product decisions;
predictable cost that does not grow with free members; answering a GDPR request
without a third party in the loop.

**This makes hard:** everything is now our responsibility — password hashing
parameters, timing-safe comparisons, session fixation, enumeration resistance,
lockout policy. There is no vendor to blame and no vendor to fix it. Adding
enterprise SSO later would be real work rather than a configuration change.

**We accept:** roughly two to three weeks of schedule spent on authentication
that a vendor would have provided; a dependency on `better-auth`, which is a
young library — mitigated by the fact that its data lives in our schema, so
replacing it is a code change and not a data migration; and the permanent
support burden of phone-only recovery, which has no second channel and therefore
no self-service path.

## Revisit if

- Account-recovery support volume exceeds roughly five cases a week, at which
  point the client should be asked to accept an optional recovery email — a
  product change, not a technology change
- A `better-auth` security advisory goes unpatched, or the project is abandoned
- Enterprise SSO becomes a requirement (the deferred "Business" tier could
  plausibly ask for it)
- Measured sign-up drop-off at the SMS step exceeds 30%, which would reopen the
  phone-only constraint itself rather than this decision
