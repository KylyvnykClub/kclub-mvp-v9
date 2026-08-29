# Architecture Decision Records

> **Write when:** from day one, forever.

A decision record is a note about **a moment**: what was decided, when, and why.

This is the only kind of documentation that cannot go stale. A description of
the system ("the API is REST") becomes false the day the system changes. A
record ("in March 2026 we chose REST over GraphQL, because …") stays true
forever, even after the decision is reversed — at which point you add a new
record and mark the old one superseded.

**Therefore: anything that can be written as a decision should be written as a
decision, not as a description.** It costs the same to write and nothing to
maintain.

---

## Write a record when

Any one of these is true:

- Reversing the choice would cost more than a week
- The team disagreed, or the discussion took more than an hour
- A newcomer would be surprised by the choice
- You rejected an obvious option — _especially_ then

Do **not** write one for choices that are cheap to reverse. A folder full of
trivia is as unusable as no folder at all.

## Process

1. Copy [0000-template.md](0000-template.md) to `NNNN-short-title.md` — next
   free number, kebab-case title.
2. Open it as a pull request with status **Proposed**. The discussion happens in
   the review.
3. On merge, set status to **Accepted** and add it to the index below.
4. Never edit an accepted record's decision or rationale. To change your mind,
   write a new record and mark the old one **Superseded by NNNN**.

The history is the value. A record that is quietly rewritten teaches the team
that the folder cannot be trusted.

## Status lifecycle

|Status|Meaning|
|-|-|
|Proposed|Under discussion, not yet binding|
|Accepted|In force|
|Superseded by NNNN|Replaced — the newer record explains why|
|Deprecated|No longer relevant, not replaced (e.g. the component is gone)|

---

## Index

|#|Title|Status|Date|
|-|-|-|-|
|[0001](0001-nextjs-monolith-on-vercel.md)|Build KCLUB as one Next.js modular monolith on Vercel|Accepted|2026-08-02|
|[0002](0002-postgresql-on-neon-with-drizzle.md)|Use PostgreSQL on Neon, with Drizzle, as the only datastore|Accepted|2026-08-02|
|[0003](0003-self-hosted-phone-authentication.md)|Self-host authentication, buying only SMS code delivery from Twilio Verify|Accepted|2026-08-02|
|[0004](0004-stripe-billing-as-system-of-record.md)|Make Stripe the system of record for subscriptions and project entitlements from webhooks|Accepted|2026-08-02|
|[0005](0005-no-member-directory.md)|There is no member directory, and the data layer makes one impossible|Accepted|2026-08-02|
|[0006](0006-postgres-full-text-search.md)|Use PostgreSQL full-text search for the catalogue, with no separate search engine|Accepted|2026-08-02|
|[0007](0007-staff-identities-separate.md)|Keep staff identities entirely separate from member identities|Accepted|2026-08-02|
|[0008](0008-durable-background-jobs-with-inngest.md)|Run background work on Inngest, fed by a transactional outbox in PostgreSQL|Accepted|2026-08-02|
|[0009](0009-referral-data-minimisation.md)|Referrals capture consent and minimise, encrypt and expire the client's contact data|Accepted|2026-08-02|
|[0010](0010-no-own-a2p-registration-with-twilio-verify.md)|Send verification codes through Twilio Verify's registered sender pool, without our own A2P 10DLC registration|Accepted|2026-08-13|
|[0011](0011-company-drafts-in-their-own-table.md)|Keep company application drafts in their own table, not as companies with a `draft` status|Accepted|2026-08-15|
|[0012](0012-postpone-phone-verification-turnstile-gate.md)|Postpone SMS phone verification and gate registration with Cloudflare Turnstile instead|Accepted|2026-08-15|
|[0013](0013-partner-logos-as-external-urls.md)|Partner logos are member-supplied external URLs, not uploaded files|Accepted|2026-08-19|
|[0014](0014-no-notification-log-table.md)|No dedicated notification log table|Accepted|2026-08-19|
|[0015](0015-password-reset-deferred-to-client.md)|Password reset stays unbuilt until the client answers the account-recovery question|Superseded by 0018|2026-08-18|
|[0016](0016-totp-seeds-encrypted-and-reissued.md)|Staff TOTP seeds are encrypted at rest, bound to their member, and the existing ones are discarded|Accepted|2026-08-22|
|[0017](0017-project-entitlements-after-the-webhook-response.md)|Project the entitlement in the webhook's own invocation, after the response has been sent|Accepted|2026-08-23|
|[0018](0018-staff-assisted-password-reset.md)|Recover accounts through a staff-performed reset, as a stopgap|Accepted|2026-08-23|
|[0019](0019-payment-before-moderation.md)|Take payment for a listing before moderation, not after|Accepted|2026-08-26|
|[0020](0020-member-inbox.md)|Give every member an in-product inbox, and demote email to a delivery channel|Accepted|2026-08-27|
|[0021](0021-member-avatar-upload.md)|Member avatars are uploaded through a server-side re-encode pipeline into R2|Accepted|2026-08-28|
|[0022](0022-company-photo-gallery.md)|Companies get a KCLUB-hosted photo gallery through the avatar upload pipeline|Accepted|2026-08-29|
|[0023](0023-company-logo-upload.md)|Company logos move onto the upload pipeline, superseding ADR 0013|Accepted|2026-08-29|
|[0024](0024-onboarding-media-staging.md)|Onboarding media is staged under the applicant's draft and promoted on submission|Accepted|2026-08-29|
|[0025](0025-city-lookup-from-countrystatecity.md)|The onboarding city picker reads city names from the CountryStateCity API|Accepted|2026-08-29|
|[0026](0026-dev-database-is-a-neon-branch-rebuilt-from-migrations.md)|The dev database is a Neon branch rebuilt from migrations, and the database says which environment it is|Proposed|2026-08-29|

Summarised in [architecture.md](../architecture.md#6-architectural-decisions).

**Two additional triggers apply to this project**, beyond the four listed above:
write a record for anything that changes **what personal data we hold or who can
see it**, and for anything that changes **how money becomes access**. Those are
the two areas where a future reader will most need to know what we were
thinking — see
[documentation.md §5](../documentation.md#5-architecture-decision-records).
