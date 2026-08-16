# Operations

> **Status:** Draft
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-15
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
|`/api/cron/outbox-drain`|every minute|Drains the transactional outbox: notification emails, moderation outcomes|
|`/api/cron/subscription-lapse`|every 2 minutes|Revokes access once a paid period has ended|
|`/api/cron/billing-reconciliation`|02:17 UTC daily|Compares local subscription rows against Stripe and alerts on divergence, without repairing|
|`/api/cron/retention`|03:41 UTC daily|Deletes abandoned company drafts after 90 days, and runs the 30-day account erasure|
|`/api/cron/referrals`|hourly at :11|Expires delivered referrals past 14 days and deletes the client contact details they hold (FR-077)|

`tests/constraints/cron-schedule-coverage.test.ts` fails if a route under
`src/app/api/cron/` has no schedule, or a schedule has no route. That suite
exists because `/api/cron/referrals` spent its whole life unscheduled: written,
tested, and never once invoked in production.

**Account erasure is partial.** The retention job performs the database half of
the procedure in
[data-storage.md §4](data-storage.md#4-retention-and-deletion) — anonymising the
member row, destroying sessions and card tokens, clearing referral contact
details — and writes an audit entry. It does **not** delete the Stripe Customer,
delete R2 images, dispose of owned companies, or clear the notification log.
Its `accountsErased` count is not a claim that those happened.

## 4. Health

|Endpoint|Answers|
|-|-|
|`/health/live`|Is the process up|
|`/health/ready`|Are the database and Redis reachable|

Both are the first things to check during an incident, before anything in
[runbooks/](runbooks/site-down.md).

## 5. Vendor dashboards

What the application does not own.

|Vendor|Managed there|
|-|-|
|Vercel|Deployments, environment variables, cron invocations, logs|
|Neon|Database, branches, point-in-time recovery|
|Stripe|Products, prices, webhook endpoint, customers, test clocks|
|Cloudflare|DNS, R2 bucket, Turnstile site and its allowed hostnames|
|Upstash|Redis, rate-limit keys, plan limits|
|Resend|Sender domain authentication, delivery logs|
|Sentry|Errors and releases|
|Twilio|**Postponed** ([0012](decisions/0012-postpone-phone-verification-turnstile-gate.md)) — no production traffic reaches it|

Which keys each needs, and whether it is required for production, is the table
in [delivery/production-env-readiness.md](delivery/production-env-readiness.md).

## 6. From a terminal

|Command|Use|
|-|-|
|`pnpm verify`|Typecheck, lint, format, i18n, unit tests — the gate before any commit|
|`pnpm build`|Production build; catches compiler rules `verify` does not|
|`pnpm test:integration`|Integration suite; needs Docker for Testcontainers|
|`pnpm db:migrate`|Apply migrations|
|`pnpm db:updownup`|Prove a migration reverses cleanly|
|`pnpm db:studio`|Browse the database|
|`pnpm db:seed:categories`, `pnpm db:seed:beta`|Reference data, then 50 members and 30 companies|
|`pnpm env:check:production`|Check a production-shaped environment before promoting|
|`pnpm smoke:deployment <url>`|Smoke a preview or production deployment|
|`python tools/check-plan.py --strict`|Every FR claimed by one task, and named by a test title|
|`python tools/check-docs.py --strict`|Broken links, missing owners, stale dates|

**`pnpm db:seed:beta` writes 50 members and 30 companies.** Confirm which
database `DATABASE_URL` points at before running it.

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
