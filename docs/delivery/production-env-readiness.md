# Production Environment Readiness

> **Status:** Draft
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-19
> **Write when:** before promoting the first production deployment.

This checklist is the production and preview provisioning gate. It is grounded
in [`src/env.schema.ts`](../../src/env.schema.ts), the Terraform files in
[`infra/`](../../infra), and the current runtime routes. It does not prove that
production is ready; it records the exact external facts that must be verified
before production promotion.

## Gate Rule

Production promotion is blocked until every row marked `Required for production`
is confirmed in Vercel, the owning vendor dashboard, and a preview or staging
smoke test. Optional rows may stay disabled for private beta only when the
decision and the degradation are recorded in the Notes column.

Preview deployments use the same checklist with test-mode vendor credentials,
synthetic data, and `noindex` behavior. Production uses live credentials and no
synthetic member data.

## Application URLs

**The production origin is `https://www.kylyvnyk.club`.** It is written here because it was
written nowhere, and on 2026-08-22 that cost an investigation: the domain still served the previous
application from the `kclub-mvp` repository while `NEXT_PUBLIC_APP_URL` already named it, so every
card QR encoded a URL that returned someone else's 404. Nothing detected it — the value is a
syntactically valid URL, and no check compares it against what the domain actually serves. The
domain was moved onto this project rather than the variable repointed at the `vercel.app` host,
because a QR code outlives the deployment that printed it.

|Key|Required for production|Source of truth|Verification|
|-|-|-|-|
|`NEXT_PUBLIC_APP_URL`|Yes|`https://www.kylyvnyk.club` — the Vercel project domain|Open the production URL and confirm generated links, robots sitemap URL, auth redirects, and Stripe return URLs use the same origin. Check `/en/card/<any-token>` renders this application's "Card Not Found" rather than a 404 from another app — that is the cheapest proof the domain and the variable agree.|
|`BETTER_AUTH_URL`|Yes|`https://www.kylyvnyk.club` — must match `NEXT_PUBLIC_APP_URL`|Confirm it matches `NEXT_PUBLIC_APP_URL`; mismatches can create invalid callback or cookie behavior. `tools/check-production-env.ts` compares the two, but passes when both are absent — see the backlog item `check-production-env-blind-to-missing-app-url`.|
|`NODE_ENV`|Yes|Vercel runtime|Confirm production deploy reports `production`.|
|`VERCEL_ENV`|Yes|Vercel runtime|Confirm production is `production` and previews are `preview`.|

## Database: Neon PostgreSQL

|Key|Required for production|Source of truth|Verification|
|-|-|-|-|
|`DATABASE_URL`|Yes|Neon pooled connection string|Confirm it is the pooled app runtime connection. Run `/health/ready` after deploy.|
|`DATABASE_URL_DIRECT`|Yes|Neon direct connection string|Confirm CI/migration path uses the direct connection, not the pooled runtime URL.|

Required external checks:

- Confirm production, staging, and preview/local use separate Neon
  branches/databases. Production credentials must appear only in Vercel
  Production and in a time-boxed incident shell; `.env.local` must point at a
  non-production branch by default.
- Confirm Neon project, region, PITR window, autoscaling bounds, and branch naming.
- Confirm production migration credentials are scoped to migration work only.
- Run `pnpm db:updownup` locally or in CI against a disposable database before merging a migration.
- Run the final migration against a production database copy or branch before production promotion.

## Authentication And Session Secrets

|Key|Required for production|Source of truth|Verification|
|-|-|-|-|
|`BETTER_AUTH_SECRET`|Yes|1Password to Vercel env|Generate a high-entropy value; changing it invalidates derived card tokens and sessions, so record the rotation plan.|
|`ADMIN_BOOTSTRAP_OWNER_PHONE`|Launch only|Owner-approved bootstrap record|Confirm it is present only while bootstrapping the first staff owner, then remove or rotate.|
|`ADMIN_BOOTSTRAP_OWNER_PASSWORD`|Launch only|Owner-approved bootstrap record|Confirm one-time use, strong value, and removal after staff owner setup.|
|`TOTP_ENCRYPTION_KEY`|Yes|1Password to Vercel env|At least 32 characters. Production **fails at boot** without it, and staff sign-in refuses rather than falling back to plaintext ([ADR 0016](../decisions/0016-totp-seeds-encrypted-and-reissued.md)). Confirm the rotation owner before staff login is enabled: rotating this key re-enrols every staff authenticator.|
|`AUTH_DEV_PHONE_BYPASS_ENABLED`|No|Development only|Must be unset or `false` in preview and production.|
|`AUTH_PHONE_VERIFICATION_ENABLED`|No — postponed|Deployment decision|Currently `false` ([ADR 0012](../decisions/0012-postpone-phone-verification-turnstile-gate.md)). Setting it to `true` makes the three Twilio keys mandatory at boot, so provision them in the same change.|
|`E2E_TEST_SECRET`|Preview only|CI secret|Must not be set in production unless an explicit production smoke route requires it.|

## Bot defense: Cloudflare Turnstile

While phone verification is postponed, Turnstile is the only cost a bot pays to
create a member account ([ADR 0012](../decisions/0012-postpone-phone-verification-turnstile-gate.md)).
`src/env.schema.ts` refuses to boot a production deployment that has neither.

|Key|Required for production|Source of truth|Verification|
|-|-|-|-|
|`TURNSTILE_SECRET_KEY`|Yes while phone verification is off|Cloudflare dashboard|Confirm the widget and the secret belong to the same Turnstile site, and that the site's allowed hostnames include the production domain.|
|`NEXT_PUBLIC_TURNSTILE_SITE_KEY`|Yes while phone verification is off|Cloudflare dashboard|Load `/register` and confirm the challenge renders; a missing site key silently renders nothing.|

Required external checks:

- Register once against production and confirm the attempt is rejected when the
  challenge is not solved.
- Confirm the widget renders in all three locales.

## SMS: Twilio Verify — postponed

**Not required for launch.** Phone verification is switched off
([ADR 0012](../decisions/0012-postpone-phone-verification-turnstile-gate.md)); the
keys below are optional at boot and unused while
`AUTH_PHONE_VERIFICATION_ENABLED` is `false`. This section stays because the
decision is a postponement, not a removal — everything here applies again the
day the flag is turned on.

|Key|Required for production|Source of truth|Verification|
|-|-|-|-|
|`TWILIO_ACCOUNT_SID`|Only when phone verification is on|Twilio console|Confirm account is the intended live account, not a trial or test project.|
|`TWILIO_AUTH_TOKEN`|Only when phone verification is on|Twilio console|Rotate before launch and store only in Vercel and 1Password.|
|`TWILIO_VERIFY_SERVICE_SID`|Only when phone verification is on|Twilio Verify service|Send and verify a production SMS to an allowlisted owner number.|

External checks, when it is turned back on:

- No A2P 10DLC brand or campaign registration is required: Verify sends from
  Twilio's own registered sender pool
  ([ADR 0010](../decisions/0010-no-own-a2p-registration-with-twilio-verify.md)).
- Confirm Fraud Guard, geographic permissions, and daily spend cap. With no
  registration gate in front of production traffic, these are the only controls
  standing between the account and SMS-pumping fraud.
- Confirm STOP/HELP handling and support contact wording.

## Billing: Stripe

|Key|Required for production|Source of truth|Verification|
|-|-|-|-|
|`STRIPE_SECRET_KEY`|Yes|Stripe live restricted key|Confirm it starts with `sk_`, belongs to the live account, and has the minimum permissions used by checkout, webhooks, and admin metrics.|
|`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`|Yes|Stripe live publishable key|Confirm it starts with `pk_` and matches the same account as `STRIPE_SECRET_KEY`.|
|`STRIPE_WEBHOOK_SECRET`|Yes|Stripe webhook endpoint|Confirm endpoint is `/api/webhooks/stripe` and replay a live-mode test event before promotion.|
|`STRIPE_VIP_PRICE_ID`|Yes for VIP sale|Stripe product catalog|Confirm it is the production VIP subscription price.|
|`STRIPE_LISTING_PRICE_ID`|Yes for listing sale|Stripe product catalog|Confirm it is the production partner listing subscription price.|
|`NEXT_PUBLIC_STRIPE_VIP_PRICE_ID`|Compatibility only|Stripe product catalog|Keep only if a deployed client still reads the public legacy key.|
|`NEXT_PUBLIC_STRIPE_LISTING_PRICE_ID`|Compatibility only|Stripe product catalog|Keep only if a deployed client still reads the public legacy key.|

Required external checks:

- Confirm webhook events include subscription lifecycle and invoice failure events.
- Confirm entitlements are projected only from webhook/reconciliation state, never from redirect success pages.
- Confirm test clocks cover subscribe, renew, fail, recover, cancel, and expire before launch.

## Cron And Background Jobs

|Key|Required for production|Source of truth|Verification|
|-|-|-|-|
|`CRON_SECRET`|Yes|1Password to Vercel env|Confirm it is set in production; `src/env.schema.ts` fails closed when `VERCEL_ENV=production` and this is missing.|
|`INNGEST_EVENT_KEY`|Required when Inngest jobs are enabled|Inngest dashboard|Confirm event delivery works from preview or staging.|
|`INNGEST_SIGNING_KEY`|Required when Inngest jobs are enabled|Inngest dashboard|Confirm webhook signature validation before enabling production jobs.|

Required external checks:

- Confirm Vercel Cron hits `/api/cron/referrals` and `/api/cron/outbox-drain` with bearer auth.
- Confirm outbox drain can project Stripe events when invoked manually.
- Record cron secret rotation steps in the operational runbook.

## Rate Limiting: Upstash Redis

|Key|Required for production|Source of truth|Verification|
|-|-|-|-|
|`UPSTASH_REDIS_REST_URL`|Yes|Upstash database|Confirm `/health/ready` validates Redis reachability.|
|`UPSTASH_REDIS_REST_TOKEN`|Yes|Upstash database|Rotate before launch and store only in Vercel and 1Password.|

Required external checks:

- Confirm region, TLS, eviction policy, plan limits, and alert thresholds.
- Confirm auth, SMS, card verification, and catalogue paths degrade safely if Redis is unavailable.

## Optional Launch Services

|Key|Required for production|Source of truth|Verification|
|-|-|-|-|
|`RESEND_API_KEY`|Optional for private beta|Resend dashboard|If enabled, send a transactional test email and confirm sender domain authentication.|
|`EMAIL_FROM`|Yes if email is enabled|Resend verified domain|Confirm the domain aligns with published contact/legal addresses.|
|`R2_ACCOUNT_ID`|Not needed — media uploads are not built and not currently planned ([ADR 0013](../decisions/0013-partner-logos-as-external-urls.md))|Cloudflare dashboard|Revisit only if that ADR is revisited.|
|`R2_ACCESS_KEY_ID`|Not needed — see `R2_ACCOUNT_ID`|Cloudflare R2 token|—|
|`R2_SECRET_ACCESS_KEY`|Not needed — see `R2_ACCOUNT_ID`|Cloudflare R2 token|—|
|`R2_BUCKET_NAME`|Required for the nightly backup dump only ([data-storage.md §5](../data-storage.md#5-backup-and-recovery)), not for media|Terraform or Cloudflare R2|Terraform currently wires this from `cloudflare_r2_bucket.media.name`.|
|`TURNSTILE_SECRET_KEY`|Optional until bot defense is enabled|Cloudflare Turnstile|Required before enabling Turnstile verification server-side.|
|`NEXT_PUBLIC_TURNSTILE_SITE_KEY`|Optional until bot defense is enabled|Cloudflare Turnstile|Must match `TURNSTILE_SECRET_KEY`.|
|`SENTRY_DSN`|Optional for private beta|Sentry project|If omitted, Sentry initialization is deferred and guarded.|
|`NEXT_PUBLIC_SENTRY_DSN`|Optional for private beta|Sentry project|Must match the intended frontend Sentry project and environment.|

## Infrastructure Gap List

Terraform currently provisions or wires:

- Vercel project, domains, build/install settings.
- Neon project and connection URI outputs.
- Upstash Redis database and REST token output.
- Cloudflare DNS records and R2 bucket name.
- Vercel env vars for `DATABASE_URL`, `DATABASE_URL_DIRECT`,
  `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `R2_BUCKET_NAME`.

Terraform does not currently provision or wire:

- `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`, or `BETTER_AUTH_SECRET`.
- Twilio Verify credentials.
- Stripe secret, publishable key, webhook secret, products, or prices.
- `CRON_SECRET`.
- Inngest keys.
- Resend sender/domain.
- R2 account/access keys.
- Turnstile keys.
- Sentry DSNs.

Those are not production-ready until they are either wired as managed Vercel
environment variables or deliberately documented as manual 1Password-to-Vercel
steps with owner, date, and verification evidence.

## Promotion Evidence

Before production promotion, attach or link evidence for:

- `pnpm env:check:production`
- `pnpm verify`
- `pnpm build`
- `pnpm test:integration`
- `pnpm db:updownup`
- `python tools/check-plan.py --strict`
- `python tools/check-docs.py --strict`
- `/health/live` on preview and production
- `/health/ready` on preview and production
- Registration SMS smoke
- Staff login with TOTP smoke
- Dashboard/profile smoke
- Directory smoke
- Card verification smoke
- Stripe checkout redirect smoke
- Stripe webhook projection smoke
- Cron outbox drain smoke

## Deployment Smoke Command

Run the repeatable smoke check against every preview used for launch approval
and once against production immediately after promotion:

```powershell
pnpm smoke:deployment https://preview-or-production-url
```

The script checks `/health/live`, `/health/ready`, the English public entry
points, and the dashboard profile gate. It expects `/health/ready` to return
`200`; a `503` is a deploy blocker because it means the database or Redis is not
reachable from the deployed environment.

## Production Env Check Command

Run this in the production deployment environment, or locally with the exact
production variables loaded:

```powershell
pnpm env:check:production
```

The command validates the runtime schema and launch-only invariants that the
generic schema cannot know: app/auth URL parity, disabled dev SMS bypass, no
production `E2E_TEST_SECRET`, no lingering bootstrap password, live Stripe keys,
and production price ids for both subscription products. The CLI evaluates the
loaded variables as production even when a local env file omits `VERCEL_ENV`, so
a green run is not accidentally downgraded to a preview/development check.
