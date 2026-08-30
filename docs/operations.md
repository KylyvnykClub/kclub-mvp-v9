# Operations

> **Status:** Draft
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-30
> **Write when:** as soon as there is something to operate.

Where each thing is managed, and by whom. This is a map, not a runbook — a
paging alert has its own page under [runbooks/](runbooks/site-down.md), and the
environment variables have their own document in
[delivery/production-env-readiness.md](delivery/production-env-readiness.md).

**The one thing to know first:** there is no production environment yet.
Everything below is reachable locally and on preview; the provisioning that
would make it reachable in production is listed in §7.

---

## 1. Staff console

Inside the product, at `/{locale}/dashboard/admin/…`. Every screen is behind
`assertCan(actor, action, subject)` in the use case, not behind the route — the
navigation hiding a link is not a permission.

|Screen|Path|Who|
|-|-|-|
|Finance: revenue, recent payments, revenue by country|`/dashboard/admin`|`staff_admin`+|
|Support: member and moderation queue counters|`/dashboard/admin/support`|`staff_support`+|
|Members: search by name, phone or card serial; cards; block and unblock|`/dashboard/admin/members`|read `staff_support`, mutations `staff_admin`+|
|Company moderation queue|`/dashboard/admin/companies`|`staff_moderator`+|
|Referral moderation, and barring a sender|`/dashboard/admin/referrals`|`staff_moderator`+|
|Reference data: categories, countries, cities|`/dashboard/admin/categories`|`staff_moderator`+|
|Staff accounts: create, disable, change role|`/dashboard/admin/staff`|`staff_owner` only|
|Audit log, searchable by actor, target and date|`/dashboard/admin/audit`|`staff_owner` only|
|Feature flags and plan prices|`/dashboard/admin/flags`|`staff_owner`|

**Sign-in requires TOTP.** A staff session is created partial and does not
authenticate anything until the code is verified
([security.md](security.md)).

**Every mutating staff action writes an audit entry**, and the audit log is
append-only at the database permission level — the application role holds
`INSERT` and neither `UPDATE` nor `DELETE`.

## 2. Member surfaces

|Screen|Path|
|-|-|
|Profile, personal details, account deletion|`/dashboard/profile`|
|Membership card with its QR|`/dashboard/profile`|
|Referrals sent and their status|`/dashboard/referrals`|
|Submit a company, four steps with a saved draft|`/dashboard/company/new`|
|Public card verification|`/{locale}/card/{token}`|

## 3. Scheduled jobs

All five are `GET` routes behind a bearer token (`CRON_SECRET`); the schedule
lives in [`vercel.json`](../vercel.json).

|Job|Schedule|What it does|
|-|-|-|
|`/api/cron/outbox-drain`|00:50 UTC daily|Drains the transactional outbox: notification emails, moderation outcomes. Runs _after_ subscription-lapse so a warning it enqueues leaves the same night, and is only the retry path for Stripe projections since ADR 0017|
|`/api/cron/subscription-lapse`|00:35 UTC daily|Two sweeps: revokes access once a paid period has ended (FR-054), then warns subscribers whose dunning grace period is within 3 days of expiring (FR-056)|
|`/api/cron/billing-reconciliation`|02:17 UTC daily|Compares local subscription rows against Stripe and alerts on divergence, without repairing|
|`/api/cron/retention`|03:41 UTC daily|Deletes abandoned company drafts after 90 days, and runs the 30-day account erasure|
|`/api/cron/referrals`|01:11 UTC daily|Expires referrals not acted on within 14 days - delivered and never answered, or never moderated - and deletes the client contact details they hold (FR-077)|

All five run once daily because the project is deployed on Vercel's Hobby
plan, which rejects any cron schedule finer than once per day. `outbox-drain`
and `subscription-lapse` ran every minute / every 2 minutes until this
constraint forced a change (see git history on this file); moving to Pro
restores sub-daily scheduling if the resulting latency - up to ~24h before a
lapsed subscription's access is revoked, or a queued notification is sent -
becomes a problem.

`tests/constraints/cron-schedule-coverage.test.ts` fails if a route under
`src/app/api/cron/` has no schedule, or a schedule has no route. That suite
exists because `/api/cron/referrals` spent its whole life unscheduled: written,
tested, and never once invoked in production.

**Account erasure.** The retention job performs the database half of the
procedure in [data-storage.md §4](data-storage.md#4-retention-and-deletion) —
anonymising the member row, destroying sessions and card tokens, clearing
referral contact details — and writes an audit entry.
`eraseStripeCustomerForMember` deletes the Stripe Customer and cancels any
active subscription first, which is also what unpublishes a live company
listing (catalogue visibility projects from subscription status, not a flag
on the company). The R2 avatar object, the owner's company gallery
objects and their company logos are deleted best-effort in the same step
(ADR 0021–0023; the gallery refs and owned company ids are collected before
`eraseMemberTx` removes the rows). There is still no notification log entry
to clear by design ([ADR 0014](decisions/0014-no-notification-log-table.md)).

## 4. Health

|Endpoint|Answers|
|-|-|
|`/health/live`|Is the process up|
|`/health/ready`|Are the database and Redis reachable; the database check also reports `environment` — what the database says it is ([ADR 0026](decisions/0026-dev-database-is-a-neon-branch-rebuilt-from-migrations.md)), so `pnpm smoke:deployment <url> --expect-database-environment production` proves a deployment is on the right database|

Both are the first things to check during an incident, before anything in
[runbooks/](runbooks/site-down.md).

## 5. Vendor dashboards

What the application does not own.

|Vendor|Managed there|
|-|-|
|Vercel|Deployments, environment variables, cron invocations, logs|
|Neon|Database, branches, point-in-time recovery|
|Stripe|Products, prices, webhook endpoint, customers, test clocks|
|Cloudflare|DNS, R2 bucket (backups and `media/`), Turnstile site and its allowed hostnames|
|CountryStateCity|API key for the onboarding city picker ([ADR 0025](decisions/0025-city-lookup-from-countrystatecity.md)); optional — the form degrades to free text without it|
|Upstash|Redis, rate-limit keys, plan limits|
|Resend|Sender domain authentication, delivery logs|
|Sentry|Errors and releases|
|Twilio|**Postponed** ([0012](decisions/0012-postpone-phone-verification-turnstile-gate.md)) — no production traffic reaches it|

Which keys each needs, and whether it is required for production, is the table
in [delivery/production-env-readiness.md](delivery/production-env-readiness.md).

## 6. From a terminal

|Command|Use|
|-|-|
|`pnpm verify`|Typecheck, lint, format, i18n, unit tests, production build — the gate before any commit|
|`pnpm build`|Production build alone; already included in `pnpm verify`, useful standalone when iterating on build-only errors|
|`pnpm test:integration`|Integration suite; needs Docker for Testcontainers|
|`pnpm db:migrate`|Apply migrations|
|`pnpm db:mark-environment --show`|Which environment the database at `DATABASE_URL` says it is ([ADR 0026](decisions/0026-dev-database-is-a-neon-branch-rebuilt-from-migrations.md))|
|`pnpm db:mark-environment production`|Mark production once, after its marker migration is applied. Relabelling a production-marked database as anything else is refused|
|`pnpm db:reset:dev`|Rebuild the `dev` branch from zero: drop the schema, apply every migration, mark it `dev`, seed categories, the staff owner, the Stripe test prices and the beta dataset. `--no-beta` skips the partners; the first run on a branch not yet marked `dev` needs `--confirm-endpoint <ep-id>`. Refuses a `production` marker with no override|
|`pnpm db:updownup`|Prove a migration reverses cleanly|
|`pnpm db:studio`|Browse the database|
|`pnpm db:seed:categories`, `pnpm db:seed`, `pnpm db:seed:beta`|Reference data; Stripe products, flags the migrations lack, the staff owner and `plan_prices`; then 50 members and 30 companies. `db:reset:dev` runs all three|
|`pnpm smoke:deployment <url> --expect-database-environment production`|Smoke a deployment and assert which database it reports|
|`pnpm env:check:production`|Check a production-shaped environment before promoting|
|`pnpm smoke:deployment <url>`|Smoke a preview or production deployment|
|`pnpm stripe:listen`|Forward Stripe test webhooks to the local dev server, pinned to the account in `.env.local`; run it in a second terminal beside `pnpm dev`, every session — without it a local checkout stays UNPAID because no `customer.subscription.*` event ever arrives|
|`pnpm stripe:check`|Diagnose Stripe webhook delivery|
|`python tools/check-plan.py --strict`|Every FR claimed by one task, and named by a test title|
|`python tools/check-docs.py --strict`|Broken links, missing owners, stale dates|

**Database environments are separated by Neon branch/database.** Production uses
only the production pooled and direct URLs in Vercel Production. Staging uses a
staging branch/database for beta and release rehearsals. Preview and local work
use disposable preview/local branches. `.env.local` must not point at the
production database except during a named, time-boxed incident.

**The local ritual.** `.env.local` holds the pooled and direct URLs of the
Neon branch `dev` — same role, same database name, one endpoint — and no
`.env` file sits beside it (Next.js reads both, and a stale URL there wins).
`pnpm db:reset:dev` is the way to a known state, whenever wanted: it is
idempotent and takes about a minute. Afterwards `pnpm dev` logs
`database environment: dev` before it serves, `pnpm stripe:listen` runs in the
second terminal as always, and checkout uses the test-mode price the seed
recorded in `plan_prices` — that row wins over `STRIPE_*_PRICE_ID` locally,
exactly as it does in production.

**That rule is enforced by the database, not by memory** ([ADR 0026](decisions/0026-dev-database-is-a-neon-branch-rebuilt-from-migrations.md)).
Every database carries a one-row marker saying which environment it _is_.
`pnpm dev` reads it before the first request and **refuses to start** on a
`production` marker; every `tools/` script that opens `DATABASE_URL` refuses
the same way, and the beta seed refuses it whatever the database holds. An
unmarked database (a fresh branch, a CI preview branch) runs with a warning.
Deployed processes never refuse — a wrong marker in production is logged, not
turned into an outage.

The incident shell is the one exception: set `KCLUB_ALLOW_PRODUCTION_DB=1` for
that single process and it runs with a warning in the transcript. The variable
is deliberately not in the env schema, and `pnpm env:check:production` rejects
a deployment that has it. The staff-owner bootstrap on production is
`KCLUB_ALLOW_PRODUCTION_DB=1 pnpm db:seed --production`, and needs both signals.

**`pnpm db:seed:beta` writes 50 members and 30 companies.** It is for staging
and preview only. **`pnpm beta:purge` removes that exact dataset by deterministic
phone numbers.** Run it dry first, confirm the printed target and counts, and
execute only with `pnpm beta:purge --execute --confirm-production-purge`.

## 7. What stands between here and production

|Blocker|Where it is tracked|
|-|-|
|Turnstile keys — production **refuses to boot** without `TURNSTILE_SECRET_KEY` while phone verification is off|`AC-13` in [delivery/production-launch-evidence.md](delivery/production-launch-evidence.md)|
|Stripe, `CRON_SECRET`, Resend, Sentry, R2 keys — Terraform does not provision these|[delivery/production-env-readiness.md](delivery/production-env-readiness.md)|
|Penetration test, WCAG 2.1 AA audit, restore drill, Stripe test-clock evidence, non-functional measurements|`AC-02`, `AC-03`, `AC-06`, `AC-08`, `AC-09` in [delivery/production-launch-evidence.md](delivery/production-launch-evidence.md)|
|Password reset has no second factor while SMS is postponed|[0012](decisions/0012-postpone-phone-verification-turnstile-gate.md), Consequences|

The full acceptance ledger is
[delivery/production-launch-evidence.md](delivery/production-launch-evidence.md);
the criteria it tracks are
[requirements.md §8](requirements.md#8-acceptance-criteria).

## 8. Project state

|What|Where|
|-|-|
|Current focus, backlog, what shipped|`.state/state.json` — local only, excluded from git|
|Active handoffs|`.state/handoffs.json` and `.state/handoffs/`|
|The plan, phase by phase|[delivery/](delivery/)|
|Why anything is the way it is|[decisions/](decisions/)|
