# Data Storage

> **Status:** In review
> **Owner:** _(fill in)_
> **Last updated:** 2026-08-02
> **Write when:** the first schema exists.

What data the system holds, where it lives, how it changes shape over time, and
how it is kept safe. The storage technologies themselves are listed in
[technology.md](technology.md#5-database-and-storage); the handling rules for
sensitive data are in [security.md](security.md#3-data-protection).

---

## 1. Data model overview

The domain is four nouns: a **member** (a verified person), a **card** (their
proof of membership), a **company** (a partner in the catalogue), and a
**subscription** (what someone pays for). Everything else supports one of these:
moderation records how a company was judged, referrals connect two companies,
and the audit log records what staff did to any of it.

Two shapes are worth noticing. First, a subscription is **polymorphic** — it
attaches either to a member (VIP) or to a company (listing) — because the two
products have identical mechanics and different subjects; keeping them in one
table means the billing lifecycle is implemented once. Second, `staff_user` has
no relationship to `member` at all: they are different populations with
different authentication, and joining them would let a compromised member
account inherit staff scope.

```text
                      ┌──────────────────┐
                      │  legal_document  │
                      │  (versioned)     │
                      └────────┬─────────┘
                               │ accepted at registration
   ┌───────────────┐   1:N     ▼          1:1      ┌──────────────────┐
   │    member     ├────▶ legal_acceptance         │ membership_card  │
   │               ├──────────────────────────────▶│  serial, tier    │
   │ phone (uniq)  │                                │  verify_token_h  │
   │ password_hash │   1:N   ┌───────────────┐      │  status          │
   │ display_name  ├────────▶│ member_session│      └──────────────────┘
   │ locale, status│         └───────────────┘
   └───┬───────┬───┘   1:N   ┌───────────────┐
       │       └────────────▶│ trusted_device│
       │ owns (1:N)          └───────────────┘
       ▼
   ┌───────────────┐  N:1   ┌──────────┐        ┌──────────┐  N:1  ┌─────────┐
   │   company     ├───────▶│ category │        │   city   ├──────▶│ country │
   │ status        │        └──────────┘        └────┬─────┘       └─────────┘
   │ discount_*    │  N:1                            │
   │ country, city ├─────────────────────────────────┘
   │ show_rank     │
   └──┬─────┬───┬──┘
      │     │   │ 1:N  ┌──────────────────────┐
      │     │   └─────▶│ company_translation  │  (en required, ru/uk optional)
      │     │          └──────────────────────┘
      │     │ 1:N  ┌──────────────────────┐
      │     └─────▶│ moderation_decision  │  append-only
      │            └──────────────────────┘
      │  sender / recipient
      │       ┌────────────────────────────┐
      └──────▶│         referral           │
              │ client_contact (encrypted) │
              │ consent_*                  │
              │ status, expires_at         │
              └────────────────────────────┘

   subject = member | company
   ┌──────────────┐  N:1  ┌────────┐  1:N  ┌───────┐
   │ subscription ├──────▶│  plan  ├──────▶│ price │  (effective_from)
   │ stripe_sub_id│       └────────┘       └───────┘
   │ status       │
   │ period_end   │  1:N   ┌──────────┐         ┌───────────────┐
   │ cancel_at_pe ├───────▶│ payment  │         │ stripe_event  │ idempotency
   └──────┬───────┘        └──────────┘         └───────────────┘
          │ 1:N
          ▼
   ┌──────────────┐
   │ entitlement  │  what the subscription unlocks *here*
   └──────────────┘

   ┌────────────┐   ┌───────────┐   ┌─────────┐   ┌────────────────────┐
   │ staff_user │──▶│ audit_log │   │ outbox  │   │ notification_log   │
   │ role, totp │   │ append-only│  └─────────┘   └────────────────────┘
   └────────────┘   └───────────┘
```

| Entity                                | Represents                                                 | Key relationships                     | Approximate volume          |
| ------------------------------------- | ---------------------------------------------------------- | ------------------------------------- | --------------------------- |
| `member`                              | A verified person                                          | 1:1 card, 1:N sessions, 1:N companies | 1,000 → 25,000              |
| `member_session`                      | An active sign-in                                          | N:1 member                            | 3,000 → 80,000 (rolling)    |
| `trusted_device`                      | A device that has already passed an SMS challenge          | N:1 member                            | 1,500 → 40,000              |
| `phone_verification`                  | One SMS code attempt; holds the Twilio SID, never the code | N:1 member (nullable)                 | 1,500 → 60,000/year, pruned |
| `membership_card`                     | Proof of membership, with a QR token                       | 1:1 member                            | 1,000 → 25,000              |
| `legal_document` / `legal_acceptance` | Versioned terms and who accepted which version             | N:1 member                            | 5 docs → 25,000 acceptances |
| `company`                             | A partner business                                         | N:1 member (owner), category, city    | 50 → 2,000                  |
| `company_translation`                 | Localised name/description/discount text                   | N:1 company                           | 100 → 4,000                 |
| `category`, `country`, `city`         | Reference data                                             | —                                     | ~40 / ~200 / ~5,000         |
| `moderation_decision`                 | One approve/reject, permanently                            | N:1 company or referral               | 100 → 5,000                 |
| `plan`, `price`                       | What we sell and for how much, with history                | 1:N                                   | 3 plans, ~10 prices         |
| `subscription`                        | A Stripe subscription, projected                           | N:1 plan; subject = member or company | 100 → 3,000                 |
| `entitlement`                         | What a subscription unlocks in the product                 | N:1 subscription                      | 100 → 3,000                 |
| `payment`                             | A settled Stripe invoice                                   | N:1 subscription                      | 300 → 30,000/year           |
| `stripe_event`                        | Every webhook received, by id                              | —                                     | 2,000 → 120,000/year        |
| `referral`                            | A client introduction between two companies                | N:2 company                           | 0 → 36,000/year             |
| `staff_user`                          | An employee of the club                                    | 1:N audit entries                     | 4 → 12                      |
| `audit_log`                           | What a staff user or the system changed                    | N:1 actor                             | 2,000 → 150,000/year        |
| `outbox`                              | Committed intent to do something outside the transaction   | —                                     | drained continuously        |
| `notification_log`                    | What we sent, to whom, in which language                   | N:1 member                            | 3,000 → 200,000/year        |

**Conventions applied to every table:** `id` is a UUIDv7 (time-ordered, so
b-tree inserts stay local and an id does not leak a sequence count);
`created_at` and `updated_at` are `timestamptz` in UTC; money is
`amount_minor bigint` plus `currency char(3)`; enumerations are PostgreSQL
`text` columns with a `CHECK` constraint rather than native enums, because
adding a value to a native enum in a zero-downtime migration is awkward.

---

## 2. Storage choices

| Store                                  | Holds                                                                                                       | Source of truth?                               | Why this store                                                                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary database (PostgreSQL 17, Neon) | Everything above                                                                                            | Yes, for everything except subscriptions       | The domain is relational and the money is transactional. It also absorbs three jobs — search, queue outbox, and JSON diffs in the audit log — that would otherwise each be a separate service to operate |
| Cache (Upstash Redis)                  | Rate-limit and quota counters, SMS send counters, catalogue facet counts, verification-page lookup counters | No                                             | Needs atomic counters with expiry at the edge of the request, which PostgreSQL can do but not cheaply at every request                                                                                   |
| Object storage (Cloudflare R2)         | Partner logos and cover images                                                                              | Yes, for the bytes; the key lives in `company` | Images do not belong in a database, and R2 charges nothing for egress                                                                                                                                    |
| Search index                           | —                                                                                                           | —                                              | Not applicable — search is a `tsvector` column inside the primary database, see [decisions/0006-postgres-full-text-search.md](decisions/0006-postgres-full-text-search.md)                               |
| Stripe                                 | Subscriptions, invoices, customers, cards                                                                   | **Yes** — ours is a projection                 | We are legally and practically better off not being the record of what someone was charged                                                                                                               |
| Twilio Verify                          | In-flight verification codes                                                                                | Yes, while in flight                           | We deliberately never store a code, so a database compromise cannot approve a verification                                                                                                               |

**If a non-authoritative store is lost.** Redis: nothing breaks. Counters reset,
which makes rate limits temporarily more permissive for one window; the durable
quota check for referrals falls back to a PostgreSQL count. Rebuild time: zero.
Search vectors: regenerated by a single `UPDATE` over `company`, under a second
at our volume. Subscription projection: rebuilt by replaying Stripe — the
reconciliation job (FR-058) already does exactly this, and running it in "full"
mode over all subscriptions takes minutes at 3,000 rows.

---

## 3. Schema and migrations

| Aspect                                | Approach                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration tool                        | `drizzle-kit generate` produces SQL; the SQL is reviewed and committed, never generated at deploy time                                                                                                                                                                                                                                                                                                                                       |
| Where migrations live                 | `db/migrations/NNNN_description.sql`, immutable once merged                                                                                                                                                                                                                                                                                                                                                                                  |
| Applied when                          | As an explicit CI step **before** the new application version receives traffic, against the same database the old version is still using                                                                                                                                                                                                                                                                                                     |
| Reversible?                           | Every migration ships with a `down.sql`, and CI proves it by applying up → down → up on a fresh branch database. Reversibility is not assumed; it is tested                                                                                                                                                                                                                                                                                  |
| Zero-downtime rule                    | Expand, migrate, contract, across three releases. Release 1 adds the new column as nullable and starts writing both. Release 2 backfills and switches reads. Release 3 drops the old column. A pull request that adds a `NOT NULL` column without a default, renames a column, or drops one still referenced by the previous release fails review — the previous version of the application is still serving traffic during a rolling deploy |
| Large-table changes                   | `CREATE INDEX CONCURRENTLY`; backfills in batches of 1,000 rows with a pause between batches, run as an Inngest job rather than inside a migration; `lock_timeout = 3s` and `statement_timeout = 30s` set for every migration session so a migration fails fast instead of blocking the site                                                                                                                                                 |
| Who may run a migration in production | Nobody by hand. Only the deployment pipeline, using a role that can `CREATE`/`ALTER` but cannot read `member.phone_e164` (see §9)                                                                                                                                                                                                                                                                                                            |

**Seed and reference data.** Categories, countries and cities are seeded from a
checked-in dataset (ISO 3166 for countries; a curated city list per country) and
maintained by staff afterwards through the console (FR-085). Plans and their
initial prices are seeded by a script that also creates the corresponding Stripe
Product and Price objects, so the two never drift at creation; afterwards a
price change is made in the console and pushed to Stripe by the same code path.
Legal documents are seeded from MDX in the repository with an explicit version
string.

---

## 4. Retention and deletion

Data we no longer hold cannot leak and cannot be demanded. Retention here is a
security control first and a cost control second.

| Data                                                                       | Retention period                                                         | Deletion method                                                                                                                                                          | Driven by                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Member account, active                                                     | While the account exists                                                 | —                                                                                                                                                                        | —                                                                                                         |
| Member account, after deletion request                                     | 30 days, then irreversible                                               | Anonymise: phone number, password hash, display name and sessions destroyed; the member row survives with `deleted_at` set so financial records keep a valid foreign key | GDPR Art. 17, balanced against tax record-keeping                                                         |
| Pending (never verified) registration                                      | 24 hours                                                                 | Hard delete                                                                                                                                                              | Minimisation — an unverified number is not a member                                                       |
| `phone_verification` rows                                                  | 90 days                                                                  | Hard delete                                                                                                                                                              | Abuse investigation window                                                                                |
| `member_session`                                                           | 30 days idle, 90 days absolute                                           | Hard delete                                                                                                                                                              | Session policy in [security.md §2](security.md#2-authentication-and-authorization)                        |
| Membership card                                                            | Life of the member; revoked cards retained 24 months                     | Retain revoked record, destroy the QR token immediately on revocation                                                                                                    | Fraud investigation                                                                                       |
| Company, unpublished by owner                                              | 12 months                                                                | Anonymise owner link, retain the moderation history                                                                                                                      | Moderation integrity                                                                                      |
| Referral **client contact details**                                        | Until accepted, declined, expired (14 days), or rejected — then 24 hours | Hard delete of the encrypted contact column; the referral shell is retained                                                                                              | Minimisation; the client is not our user ([decisions/0009](decisions/0009-referral-data-minimisation.md)) |
| Referral shell (who referred whom, when, outcome)                          | 24 months                                                                | Hard delete                                                                                                                                                              | Abuse and dispute handling                                                                                |
| Payment and invoice records                                                | 7 years                                                                  | Retained; never deleted by a user request                                                                                                                                | Tax and accounting law. Named explicitly in the Privacy Policy as an exception to erasure                 |
| Audit log                                                                  | 7 years                                                                  | Never deleted from the application                                                                                                                                       | [security.md §7](security.md#7-auditing-and-access-control)                                               |
| Application logs                                                           | 30 days                                                                  | Automatic expiry in Axiom                                                                                                                                                | Cost and minimisation                                                                                     |
| Notification log (recipient, template, language, outcome — never the body) | 12 months                                                                | Hard delete                                                                                                                                                              | Deliverability debugging                                                                                  |
| Database backups                                                           | 30 days point-in-time, 12 monthly snapshots                              | Automatic expiry                                                                                                                                                         | Recovery window                                                                                           |

**Soft vs. hard delete.** Soft delete (`deleted_at`) is used only where a
foreign key must survive: members with payment history, and companies with
moderation history. Everywhere else deletion is a `DELETE`. Every query path
that can return a soft-deleted row goes through a repository function that
excludes them by default; the unfiltered variant is named `…IncludingDeleted`
so that reading it in a diff is enough to notice.

**User deletion request.** The full procedure, in order, and it must be run end
to end — a deletion that stops at the primary database is not a deletion:

1. Member requests deletion in the member area, or support records a request.
   The request is logged with its timestamp; the 30-day clock starts.
2. Sessions are revoked and sign-in is blocked immediately, so the account
   cannot be used during the window.
3. On day 30 an Inngest job runs the erasure: anonymise the member row; delete
   sessions, trusted devices, verification records and the card's QR token;
   delete or anonymise owned companies (unpublishing any that are live);
   hard-delete any referral contact data they submitted; delete their entry from
   the notification log.
4. Stripe: the Customer object is deleted through the API, which removes the
   payment method and the billing address. Invoices remain in Stripe, as
   required by tax law and stated in the Privacy Policy.
5. R2: images uploaded for their companies are deleted by key.
6. Axiom: log records are not individually deletable; they expire at 30 days
   and contain a `member_id`, never a phone number or a name. Stated in the
   Privacy Policy.
7. Backups: not rewritten. The erasure is re-applied automatically if a backup
   is ever restored, by a post-restore job in the runbook. This is the standard
   position and it is documented for the regulator rather than glossed over.
8. The audit log records that an erasure occurred, by internal id only.

**Anonymisation.** After erasure a member row keeps: internal id, country,
registration month, tier history and subscription linkage. That is enough for
revenue reporting and cohort counts and insufficient to identify a person.

---

## 5. Backup and recovery

| Store                   | Method                                      | Frequency         | Retained             | Location                                                                                     | Encrypted                                                             |
| ----------------------- | ------------------------------------------- | ----------------- | -------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| PostgreSQL (Neon)       | Continuous WAL, point-in-time restore       | Continuous        | 30 days              | `us-east-1`                                                                                  | Yes, AES-256 at rest                                                  |
| PostgreSQL logical dump | `pg_dump` to R2, written by a scheduled job | Nightly 03:15 UTC | 12 monthly, 30 daily | Cloudflare R2, `eu-central-1`, **separate account and separate credentials from production** | Yes, and additionally age-encrypted with a key held only in 1Password |
| Cloudflare R2 (images)  | Object versioning                           | Continuous        | 30 days              | Same bucket                                                                                  | Yes                                                                   |
| Stripe                  | Vendor-managed; not ours to back up         | —                 | —                    | —                                                                                            | —                                                                     |
| Secrets                 | 1Password vault with its own recovery       | Continuous        | —                    | —                                                                                            | Yes                                                                   |

The second row is the one that matters. Neon's own point-in-time recovery
protects against our mistakes; it does not protect against our Neon account
being compromised or closed. The nightly dump lives in a different vendor, a
different region and a different credential set, which is the only configuration
that survives "the production credentials were used to destroy everything".

**Point-in-time recovery:** yes, to any second within the last 30 days, via a
Neon branch created at that timestamp. Restoring to a branch first is always
preferred to restoring in place: it is non-destructive and can be inspected
before promotion.

**Restore procedure** — the commands someone runs at 03:00, kept as a runbook
and rehearsed:

1. Declare the incident and freeze deploys (`vercel deploy` disabled by the
   pipeline flag).
2. `neonctl branches create --name restore-<incident> --parent-timestamp <ts>` —
   creates a full copy at that moment without touching production.
3. Verify on the branch: row counts for `member`, `subscription`, `company`;
   spot-check the last known-good record; confirm the damage is absent.
4. Put the application into maintenance mode (`MAINTENANCE=1` environment
   variable; the middleware serves a status page in all three languages).
5. Repoint `DATABASE_URL` to the restored branch and redeploy, **or** promote
   the branch to primary if the damage is total.
6. Run the reconciliation job in full mode so subscription state is repaired
   against Stripe for anything that happened after the restore point.
7. Re-apply any erasure requests that fell inside the restored window.
8. Leave maintenance mode; write the post-mortem.

**Restore drills:** quarterly, on the first Tuesday, performed by the tech lead
against a production point-in-time restored to a branch, timed and recorded in
[reliability.md §6](reliability.md#6-backup-and-restore). A drill that is not on
the calendar does not happen, and a backup that has never been restored is a
hypothesis.

---

## 6. Consistency and transactions

| Operation                                                             | Guarantee needed                                            | How it is achieved                                                                                                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Verify phone → activate member → issue card → record legal acceptance | Strong, all-or-nothing                                      | One database transaction. A verified member without a card is a support ticket; a retryable failure is not                                                               |
| Record a Stripe event → project entitlement                           | Exactly-once effect                                         | `stripe_event.id` is the primary key, so a duplicate delivery fails the insert; projection is idempotent and is a fold over the current subscription object, not a delta |
| Approve a company → publish it                                        | Strong within the database; eventual with respect to Stripe | Publication requires `approved ∧ listing_active`; both are local columns updated in transactions                                                                         |
| Create a referral → decrement quota                                   | Strong                                                      | Quota is enforced by a durable `COUNT` inside the same transaction, with a partial index supporting it; Redis is a fast pre-check only, never the authority              |
| Send a notification after a domain change                             | At-least-once, never before the change commits              | Outbox: the notification row commits with the domain change; a dispatcher delivers it afterwards                                                                         |
| Change a price                                                        | Strong locally, then propagated                             | New `price` row with `effective_from`; the Stripe Price object is created by the same job, and the local row is not marked active until Stripe confirms                  |
| Read your own write after a mutation                                  | Strong                                                      | All reads go to the primary. When a read replica is added, member-area reads that follow a mutation in the same request stay pinned to the primary                       |

**Cross-store writes.** Three exist, and each uses the outbox rather than a
best-effort call inside a transaction:

- Database + Stripe (creating a Checkout session, cancelling a subscription):
  the local intent is written first; the Stripe call is made by a job with an
  idempotency key derived from the intent row's id, so a retry cannot create two
  subscriptions.
- Database + Twilio: no transaction spans them. A code is requested before any
  durable state exists, so a failure leaves nothing to compensate.
- Database + R2: the object is uploaded to a temporary key first and the
  database row commits with the final key; an orphan-object sweep runs weekly.
  An orphaned object costs a fraction of a cent; a database row pointing at a
  missing object is a broken page.

**Read replicas:** none at launch. When added, they serve the staff console's
analytical queries and the marketing showcase only. Member-area reads stay on
the primary until there is a measured reason to move them, because replication
lag plus "did my payment work" is a bad combination.

**Concurrency control.** Optimistic, with a `version` integer on `company`,
`subscription` and `referral`: an update asserts the version it read and fails
with `Conflict` if another writer won. The staff console surfaces this as "this
record changed while you were editing" rather than silently overwriting a
colleague's decision. Where a true lock is needed — issuing a card serial,
claiming an outbox batch — `SELECT … FOR UPDATE SKIP LOCKED` is used.

---

## 7. Caching

| Cached                                                          | Where                                       | TTL                                   | Invalidated by                            | Staleness tolerated                                 |
| --------------------------------------------------------------- | ------------------------------------------- | ------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| Marketing pages, legal pages                                    | CDN (Vercel)                                | 1 hour, `stale-while-revalidate` 24 h | Deploy                                    | Yes — content changes with a release                |
| Curated showcase (top/featured partners)                        | CDN, ISR                                    | 5 minutes                             | Tag revalidation when staff change a rank | Yes, up to 5 minutes                                |
| Static assets, fonts, images                                    | CDN                                         | 1 year, immutable, content-hashed     | New hash                                  | Yes                                                 |
| Catalogue facet counts (how many partners per category/country) | Redis                                       | 5 minutes                             | Company publish/unpublish                 | Yes                                                 |
| Reference data (categories, countries, cities)                  | In-process LRU                              | 10 minutes                            | Deploy or explicit bust on edit           | Yes                                                 |
| Card verification result                                        | **Not cached**                              | —                                     | —                                         | No. A revoked card must read as revoked immediately |
| Any member-specific response                                    | **Not cached anywhere shared**              | —                                     | —                                         | No                                                  |
| Entitlements                                                    | In-request memo only, never across requests | request                               | —                                         | No                                                  |

Member-area responses are served with `Cache-Control: private, no-store` and
`Vary: Cookie`. The failure mode being designed out is one member's page being
served to another from a shared cache, which is a privacy breach in a product
whose entire premise is privacy — worth the lost efficiency.

**Cold-cache behaviour.** A full Redis flush costs nothing but a burst of
recomputation: facet counts are a single grouped query over ≤ 15,000 rows, and
rate-limit counters starting empty make limits temporarily more permissive for
one window, not absent. The database survives a cold cache comfortably at every
volume in [requirements.md §5.3](requirements.md#53-scalability).

---

## 8. Performance and scaling

| Aspect                  | Approach                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Indexing strategy       | Index every foreign key and every column used in a `WHERE` on a hot path. Named specifically: unique on `member.phone_e164`; unique on `membership_card.verify_token_hash`; composite on `company (status, category_id, country_code, city_id)` for the catalogue filter; GIN on `company.search_vector`; GIN `pg_trgm` on `company.name` for prefix search; partial index on `referral (sender_company_id, created_at) WHERE created_at > now() - interval '24 hours'` for the quota check; composite on `audit_log (actor_id, created_at DESC)`; index on `outbox (created_at) WHERE processed_at IS NULL` |
| Known expensive queries | The finance dashboard's revenue-by-country aggregation (FR-082) — scans `payment` for a month and joins `member`; capped by a materialised daily rollup refreshed hourly. The catalogue's combined filter + full-text query — kept under 400 ms by the composite index plus the GIN index, verified in CI against a 10,000-row fixture with `EXPLAIN` assertions                                                                                                                                                                                                                                             |
| Slow query monitoring   | `pg_stat_statements` sampled hourly into a dashboard; any statement whose mean exceeds 200 ms raises a warning; Neon's own slow-query log at 500 ms. See [observability.md](observability.md)                                                                                                                                                                                                                                                                                                                                                                                                                |
| Connection pooling      | Neon's pooled endpoint (PgBouncer, transaction mode) is the only endpoint the application uses; the direct endpoint is reserved for migrations. Serverless functions must never hold a session-mode connection, and prepared statements are disabled accordingly                                                                                                                                                                                                                                                                                                                                             |
| Archiving of old rows   | `audit_log`, `payment` and `notification_log` are partitioned by month once any exceeds 5 million rows; partitions older than the retention period are detached and dropped rather than deleted row by row                                                                                                                                                                                                                                                                                                                                                                                                   |
| Scaling plan            | Vertical first (Neon autoscaling compute, currently 1–4 CU) → read replica for the staff console and marketing → partition the three growth tables by month → only then consider anything else. Sharding is not in this plan and should not be added to it without a decision record explaining what changed                                                                                                                                                                                                                                                                                                 |

---

## 9. Data access

| Consumer           | Access                                                                                                                                                                                                        | Restrictions                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application        | Pooled endpoint, role `app_rw`                                                                                                                                                                                | `SELECT`/`INSERT`/`UPDATE` on domain tables; `INSERT` only on `audit_log` — no `UPDATE`, no `DELETE` grant, so the application literally cannot rewrite its own audit trail; no `DDL` |
| Migration pipeline | Direct endpoint, role `app_migrate`                                                                                                                                                                           | `DDL` only, used exclusively by CI, credentials not present in the runtime environment                                                                                                |
| Developers         | **No standing access to production.** Read-only access is granted for a named incident, time-boxed to 4 hours, through a Neon role that masks `member.phone_e164` and `referral.client_contact` behind a view | Granted by the owner, announced in the incident channel, logged, and expiring automatically. Every session is recorded in the audit log by hand as part of the runbook                |
| Analytics / BI     | None. The staff console is the only reporting surface                                                                                                                                                         | If a BI tool is ever added it connects to a read replica with a masked view, never to the primary                                                                                     |
| Support tooling    | The staff console only, under the role model in [security.md §2](security.md#2-authentication-and-authorization)                                                                                              | Support staff see what the console shows them and nothing more; the console is the audit boundary                                                                                     |
| Backups            | Written by a job role with `pg_dump` rights, read by nobody routinely                                                                                                                                         | Restoring a dump requires the 1Password age key, held by the owner and the tech lead                                                                                                  |

**Production data in non-production environments: forbidden.** No exception, no
"masked copy for debugging". Preview and staging are seeded with generated data
from a factory that produces realistic shapes and no real people — a database
branch is created from the _schema_, not from the data. The one operational cost
of this rule is that a bug reproducible only with production data must be
diagnosed with a query against production under the incident-access process
above, and that friction is deliberate.
