# 0026. The dev database is a Neon branch rebuilt from migrations, and the database says which environment it is

> **Status:** Proposed
> **Date:** 2026-08-29
> **Deciders:** Launch owner (via session)

## Context

Local development and production shared one Neon database — the `main`
branch — from the first deploy until this record. [operations.md §6](../operations.md#6-from-a-terminal)
and [data-storage.md §9](../data-storage.md#9-data-access) had forbidden this
all along; nothing enforced it. Then real members arrived, and the cost of the
gap stopped being hypothetical:

- `pnpm db:seed:beta` once wrote 50 synthetic members and 30 fake partners
  into production from a developer's `.env.local` (fixed by
  [`tools/beta-seed-guard.ts`](../../tools/beta-seed-guard.ts), which reads the
  database's contents rather than a CLI flag — a narrow fix for one tool).
- `pnpm db:migrate` from a laptop is the only way a migration has ever reached
  production, and it took the site down twice (backlog
  `no-production-migration-step`).
- A test-mode Stripe price row in the shared `plan_prices` table broke live
  checkouts (backlog `stripe-price-ids-from-the-wrong-account`).
- Production holds 54 members and 32 companies, and nobody can say which of
  them are people (backlog `orphan-test-member-holds-a-real-phone-in-production`).

The owner decided the shape of the fix before the design: the dev database is
a Neon branch named `dev` in the same project; it holds synthetic data only;
and this record covers the database, not the other shared state (Upstash
Redis and the R2 bucket are still shared — backlog).

The interesting question was how to make "never point dev at production"
_enforced_ rather than remembered. `VERCEL_ENV` cannot do it: it says where the
application runs, not which database it is connected to, and the two differ
exactly in the failure case — a laptop, `NODE_ENV=development`, holding the
production URL. The connection string cannot do it either: a Neon endpoint id
is opaque, and hard-coding the production host in the repository is both a
leak and a value that changes on restore.

## Decision

**The database carries a one-row marker saying which environment it is.**

`database_environment` has a single row whose `name` is one of `production`,
`dev`, `preview`, `test`. The migration creates the table and inserts nothing:
a fresh database is _unmarked_. Production is marked once, by hand, with
`pnpm db:mark-environment production`. A dev branch is marked `dev` by the
reset tool, after it has rebuilt the branch.

**Every process reads the marker before it does anything else**, and acts on a
single pure decision ([`src/lib/database-environment-guard.ts`](../../src/lib/database-environment-guard.ts)):

- `next dev` (and any local `next start`) **refuses to boot** against a
  `production` marker. A deployed process never refuses — a wrong marker in
  production is something to alert on, not a reason to take the site down at a
  cold start — so `VERCEL_ENV=production` off the production marker, and
  `VERCEL_ENV=preview` on it, warn instead.
- Every tool under `tools/` that opens `DATABASE_URL` refuses a `production`
  marker unless it was invoked with `--production` _and_
  `KCLUB_ALLOW_PRODUCTION_DB=1` is set, which is the shape of the one
  legitimate case: the staff-owner bootstrap.
- An unmarked database is allowed with a warning. Fresh branches, CI preview
  branches, Testcontainers and the e2e harness are all unmarked, and refusing
  them would break every one.

**The dev branch is rebuilt from the migrations, never copied.** `pnpm
db:reset:dev` drops the `public` and `drizzle` schemas on the branch, applies
`db/migrations` from zero with the same migrator drizzle-kit uses, marks the
branch `dev`, and seeds categories, the staff owner, the Stripe test-mode
prices and the beta dataset. It has **no escape hatch** for a `production`
marker: a branch copied from production inherits the `production` row, so the
copied data is refused by every dev tool until the reset has wiped it, and the
only way from `production` to `dev` is through `DROP SCHEMA`.

`KCLUB_ALLOW_PRODUCTION_DB` is read raw from `process.env`, like
`KCLUB_SKIP_DB_PRERENDER`, and is deliberately absent from the env schema: it
is not a setting, it is the documented incident shell of
[data-storage.md §9](../data-storage.md#9-data-access) made explicit, and
`pnpm env:check:production` rejects its presence.

## Rationale

The marker is the one signal that survives every way the URL can be wrong. It
travels with the data — a restored branch, a copied branch and production
itself all say `production` — and it costs one primary-key read per process
start.

Refusing at boot rather than at first write is the point. A guard on the seed
script protects the seed script; the beta seed guard already existed and
production still received a test member through the ordinary registration
form, because the developer was simply using the app. Only the process that
serves the app can close that path.

Warn-not-refuse for deployments and for unmarked databases keeps the guard
from becoming the outage. The failure this record prevents is a laptop on
production; it is not worth a failure mode where a missed manual step marks
nothing and the next cold start refuses to serve.

## Alternatives considered

|Alternative|Why not|
|-|-|
|Allow-list the production host in code or in an env var|The endpoint id changes on every restore-to-branch (data-storage.md §5) and leaks a production locator into the repository. The marker is data, and data follows the restore|
|Decide from `VERCEL_ENV` / `NODE_ENV` alone|Names the deployment, not the database; the dangerous case is precisely a development process with a production URL|
|A schema-only Neon branch and no marker|Solves the copy, not the pointing. Nothing stops `.env.local` from holding the `main` URL a week later|
|Refuse an unmarked database|Would break CI preview branches, Testcontainers, the e2e harness and the first run on a fresh branch, all of which are legitimately unmarked. The warning is enough; a production database is never unmarked once step 3 of the runbook has run|
|Separate Neon project for dev|Full isolation, but a second set of roles, quotas and Terraform for no protection the marker does not already give. A branch in the same project keeps `neonctl`, PITR and the existing preview workflow as they are. Project access still equals production access — accepted for this scope|
|Anonymised copy of production|Forbidden by data-storage.md §9 and a script to maintain forever. Synthetic seed data already exists|

## Consequences

**This makes easy:** starting a session — `pnpm db:reset:dev` is one command
from an empty branch to a working app with a staff owner and thirty partners.
Answering "is this production?" — `pnpm db:mark-environment --show`, or the
`environment` field on `/health/ready`.

**This makes hard:** running anything against production from a laptop. That
is the intent. The staff-owner bootstrap needs two explicit signals; the reset
cannot be pointed at production at all; an incident shell must set the escape
hatch and leaves a warning in the transcript.

**Not solved here:** preview deployments still run on the production database
(`infra/vercel.tf` gives Vercel `preview` the `main` URL while `preview.yml`
creates a per-PR branch nobody connects to); the Redis rate-limit keys and the
R2 bucket are shared across environments; the production migration path is
still a laptop until `launch-security-blockers` Phase 5 lands. Each is a
backlog item.

**Revisit when:** a second developer joins (each needs their own branch, and
`dev` becomes a name pattern rather than a name); or a production migrate step
exists in CI, at which point marking production can move into it.
