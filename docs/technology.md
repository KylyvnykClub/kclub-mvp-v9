# Technology

> **Status:** In review
> **Owner:** _(fill in)_
> **Last updated:** 2026-08-02
> **Write when:** while the stack is being chosen — not after, when it has been
> chosen by default by whoever wrote first.

Which technologies this project uses, and — more importantly — why each was
chosen over the alternatives. Structure built from these parts is described in
[architecture.md](architecture.md).

---

## 1. Summary

|Layer|Choice|Version|
|-|-|-|
|Language(s)|TypeScript (everywhere, including infrastructure and tests)|5.9|
|Frontend|Next.js App Router, React Server Components, Tailwind CSS, shadcn/ui|Next 15.x, React 19|
|Backend|Next.js Route Handlers and Server Actions on Node.js|Node 22 LTS|
|Database|PostgreSQL on Neon, accessed through Drizzle ORM|PostgreSQL 17|
|Hosting|Vercel (application, CDN, cron), Neon (database), Upstash (Redis)|—|

One language, one repository, one deployable unit. With three engineers, every
additional runtime is a tax paid on every incident.

---

## 2. Selection criteria

Written before the choices below, and applied to each of them. Weighted for a
team of three shipping a first release in about fifteen weeks and then operating
it without a dedicated platform engineer.

|Criterion|Weight|Note|
|-|-|-|
|Operational burden|High|Nobody is on call full time. Anything requiring us to patch, scale or fail over a server loses by default|
|Team familiarity|High|TypeScript and React are the team's daily tools. A stack the team must learn costs weeks that the schedule does not have|
|Correctness of money and identity|High|Billing and authentication are where a defect is unrecoverable. Prefer boring, well-documented, heavily used components with test facilities|
|Time to first release|High|The commercial risk is an empty club, not a slow one. Anything that trades a week of setup for a millisecond of latency loses|
|Cost at our scale|Medium|Under 25,000 members the whole platform should stay near $400/month. Per-seat and per-MAU pricing is scrutinised because it grows with success|
|Exit cost / lock-in|Medium|Accepted for the application host. Not accepted for data: the database, the object store and the search index must be standard and portable|
|Ecosystem and maintenance|Medium|Prefer projects with a company or foundation behind them and a release in the last 90 days|
|Licensing|Low|Permissive only (MIT/Apache-2.0/BSD). No AGPL, no source-available licence with a usage clause|

---

## 3. Frontend

**Decision:** Next.js 15 (App Router) with React 19 Server Components,
TypeScript, Tailwind CSS 4 and shadcn/ui components, rendered as a hybrid —
static marketing pages, server-rendered member pages, client components only
where interaction demands them.

**Rationale:** The marketing site must be fast and indexable to sell a premium
club, while the member area must not leak data into a client bundle. Server
Components give both from one codebase: catalogue queries run on the server and
ship HTML, so the browser never receives a member list it is merely not
rendering. Tailwind plus shadcn/ui gives a themable design system without
maintaining a component library — the components are copied into the repository
and owned, so there is no upstream to fight when the club's visual identity
diverges.

**Alternatives considered:** A separate React SPA plus an API — rejected because
it doubles the auth surface, forces every catalogue query through a public
endpoint that must then be defended against enumeration, and costs SEO on the
marketing site. Remix/React Router 7 — a good fit technically, smaller
ecosystem for the specific integrations we need. Astro plus a separate app —
splits the codebase in two for a benefit (marketing performance) that Next.js
already delivers.

|Concern|Choice|Note|
|-|-|-|
|Framework|Next.js 15, App Router|Server Components by default; `'use client'` is a reviewed exception|
|Language|TypeScript 5.9, `strict`|`any` is a lint error, not a style preference|
|Styling|Tailwind CSS 4 with CSS custom properties for tokens|Themes are token swaps; see [ux.md §6](ux.md#6-design-system)|
|Component base|shadcn/ui (Radix primitives)|Accessible primitives, owned in-repo. Radix carries the keyboard and ARIA behaviour we would otherwise get wrong|
|State management|Server state in RSC; `nuqs` for URL state; Zustand only where genuinely client-local|No global client store. Catalogue filters live in the URL so results are shareable|
|Forms and validation|React Hook Form + Zod, with the **same Zod schema** used by the server|One definition of "valid", enforced on the server regardless of the client|
|Routing|Next.js file routing with locale segments (`/[locale]/…`)|See i18n below|
|Rendering strategy|Hybrid: SSG for marketing and legal, SSR for member area and staff console, ISR for the curated showcase|Nothing in the member area is cached at the edge|
|Internationalisation|`next-intl`|Locale-prefixed routes, message catalogues in `messages/{en,ru,uk}.json`, missing-key check in CI|
|Charts (staff console)|Recharts + a topojson world map|Small, no licence cost; the finance map in FR-082 is the only heavy visual|
|QR generation|`qrcode` rendered server-side to SVG|No client library, no third-party QR service (a hosted generator would see every card token)|

---

## 4. Backend

**Decision:** The backend is part of the same Next.js deployment — Server
Actions for mutations initiated by our own UI, Route Handlers for anything with
an external caller (Stripe and Twilio webhooks, the card verification endpoint,
health checks). Business logic lives in a framework-independent `src/domain`
layer that neither imports React nor knows about HTTP.

**Rationale:** There is exactly one consumer of this API — our own frontend.
Publishing a REST surface for it would mean designing, versioning, documenting
and defending endpoints that nobody outside the repository will ever call. The
`src/domain` boundary is what keeps this from becoming a framework-shaped
codebase: if Next.js is ever the wrong host, the part that took the longest to
get right moves unchanged.

**Alternatives considered:** A separate NestJS or Fastify service — the right
answer with multiple clients or multiple teams, pure overhead with one of each;
revisit when a native application or a partner API appears. tRPC — solves a
problem (typed client/server calls) that Server Actions already solve inside one
Next.js codebase. A Go or Python service for background work — a second language
and a second deployment for no capability we lack.

|Concern|Choice|Note|
|-|-|-|
|Language / runtime|TypeScript on Node.js 22 LTS|Node runtime, not Edge: we need `pg`, `crypto` and predictable connection pooling|
|Framework|Next.js Route Handlers + Server Actions|Public HTTP surface documented in [integration.md §3](integration.md#3-inbound-api)|
|API style|Internal RPC (Server Actions); REST only for webhooks and the verification endpoint|See [integration.md](integration.md)|
|Validation|Zod at every trust boundary|A Server Action is a public HTTP endpoint. It validates and authorises exactly like one|
|Authorization|Explicit `assertCan(actor, action, subject)` at the top of every domain use case|Never inferred from the UI or from route placement — see [security.md §2](security.md#2-authentication-and-authorization)|
|Background jobs|Inngest|Durable multi-step functions with retries and replay; see [decisions/0008-durable-background-jobs-with-inngest.md](decisions/0008-durable-background-jobs-with-inngest.md)|
|Scheduled work|Inngest cron for business jobs; Vercel Cron only for the health canary|One scheduler for anything that must not silently stop|
|Authentication library|`better-auth`, self-hosted, with the phone-number, TOTP and session-management plugins|[decisions/0003-self-hosted-phone-authentication.md](decisions/0003-self-hosted-phone-authentication.md)|
|Rate limiting|`@upstash/ratelimit` on Upstash Redis, sliding window|Limits in [integration.md §6](integration.md#6-rate-limits-and-quotas)|
|Email|Resend with React Email templates|Transactional only; Stripe sends receipts|
|SMS|Twilio Verify for codes, Twilio Messaging for notifications|Verify owns code generation, expiry, attempt limits and fraud scoring|
|Observability SDK|OpenTelemetry via Vercel's exporter; Sentry for errors|[observability.md](observability.md)|

---

## 5. Database and storage

**Decision:** A single PostgreSQL 17 database on Neon, accessed through Drizzle
ORM, with Upstash Redis for rate-limit counters and short-lived caches, and
Cloudflare R2 for partner logos and images.

**Rationale:** The data volumes in
[requirements.md §5.3](requirements.md#53-scalability) are small and the access
patterns are relational — members own cards, companies belong to categories and
cities, subscriptions attach to either. PostgreSQL also removes the need for
three other services: full-text search (`tsvector` + `pg_trgm`), the job
outbox, and JSON storage for audit-log diffs. Neon adds serverless connection
pooling, which matters because Vercel functions scale to many short-lived
connections, and database branching, which gives every pull request a real
database. Drizzle is chosen over Prisma for its SQL-shaped API and near-zero
cold-start cost — see
[decisions/0002-postgresql-on-neon-with-drizzle.md](decisions/0002-postgresql-on-neon-with-drizzle.md).

**Alternatives considered:** Supabase — the same PostgreSQL plus auth, storage
and row-level security; rejected because we self-host authentication anyway
(§4), which removes most of the bundle's value, and because RLS as the primary
authorization mechanism is hard to test and reason about for a team of three.
MongoDB — the domain is relational and the money is transactional. PlanetScale —
MySQL without native full-text ranking or `jsonb`. A managed Elasticsearch for
catalogue search — see
[decisions/0006-postgres-full-text-search.md](decisions/0006-postgres-full-text-search.md).

|Purpose|Technology|Note|
|-|-|-|
|Primary datastore|PostgreSQL 17 (Neon, `us-east-1`, autoscaling compute)|Single source of truth for everything|
|Connection pooling|Neon pooled endpoint (PgBouncer, transaction mode)|Serverless functions must never hold a direct connection|
|Cache|Upstash Redis|Rate-limit counters, SMS send counters, catalogue facet counts. Never authoritative — losing it degrades nothing but throughput|
|File / object storage|Cloudflare R2, S3-compatible|Partner logos and cover images. No egress fees; S3 API keeps it portable|
|Image delivery|`next/image` with R2 as the remote source|Resizing and format negotiation at the CDN|
|Search|PostgreSQL `tsvector` + `pg_trgm`, weighted, per-language configurations|Catalogue is ≤ 15,000 rows at the design ceiling|
|Queue / message bus|Inngest (hosted), backed by an outbox table in PostgreSQL|The outbox is what makes "write the row and enqueue the job" atomic|
|Migrations|`drizzle-kit` SQL migrations, checked in|[data-storage.md §3](data-storage.md#3-schema-and-migrations)|

---

## 6. Infrastructure and hosting

|Concern|Choice|Note|
|-|-|-|
|Cloud / hosting provider|Vercel (application), Neon (database), Upstash (Redis), Cloudflare (R2, DNS)||
|Region(s)|Primary compute and database in `us-east-1` (AWS Northern Virginia); static assets on Vercel's global edge network|The primary market is the United States. EU members read static content from an edge node and dynamic content from Virginia|
|Compute model|Serverless functions (Vercel Fluid compute, Node.js runtime)|No servers to patch. Cold starts mitigated by keeping the Node runtime warm on the member routes|
|Orchestration|None — the platform schedules|Deliberate: Kubernetes for one application and three engineers is a second product to maintain|
|Infrastructure as code|Terraform for Neon, Upstash, Cloudflare and Vercel project configuration; state in Terraform Cloud|Console-clicked infrastructure is undocumented infrastructure. The exception is Stripe product/price objects, which are created by a checked-in seed script|
|Secrets|Vercel environment variables per environment, sourced from 1Password; production values readable only by the owner|[security.md §4](security.md#4-secrets-management)|
|CDN|Vercel Edge Network|Member-area responses are `private, no-store`; only marketing and static assets are cached|
|DNS / TLS|Cloudflare DNS; certificates issued and renewed by Vercel|HSTS with `preload` after two weeks of stable production|
|Domains|`kclub.com` (marketing + member area), `admin.kclub.com` (staff console), `card.kclub.com` (QR verification)|Three origins so cookies, CSP and indexing rules differ by purpose — see [security.md §6](security.md#6-application-security-controls). Exact domains to be confirmed by the client|
|Data residency|All personal data in `us-east-1`; backups in the same region, replicated to `eu-central-1`|EU transfers rest on Standard Contractual Clauses; see [security.md §8](security.md#8-compliance)|

**Rationale:** The client chose a managed platform explicitly, and the shape of
this product agrees with that choice: traffic is bursty and low, the team is
small, and every hour spent on infrastructure is an hour not spent on the
catalogue. The accepted price is lock-in at the application host. It is bounded
deliberately — the application is a standard Node.js server, the database is
standard PostgreSQL, and object storage speaks S3. Moving to containers on AWS
or Fly would be a week of work on deployment configuration and none on the
product.

**Estimated running cost at launch (~1,000 members, 50 partners):**

|Item|Monthly|
|-|-|
|Vercel Pro (3 seats + usage)|~$90|
|Neon Scale|~$70|
|Upstash Redis|~$10|
|Inngest|~$50|
|Sentry Team|~$30|
|Axiom (logs)|~$25|
|Resend|~$20|
|Cloudflare R2 + DNS|~$5|
|Twilio Verify (~1,000 verifications)|~$55|
|Better Stack (uptime + status page)|~$25|
|**Total**|**~$380**|

Stripe takes 2.9% + $0.30 per charge (~$0.88 on $19.99), which is a cost of
revenue rather than a platform cost. Break-even against platform cost is around
25 paying subscriptions.

---

## 7. Environments

|Environment|Purpose|Deployed by|Differs from production how|
|-|-|-|-|
|Local|Development|Anyone|PostgreSQL and Redis in Docker; Stripe and Twilio in test mode; SMS codes written to the console instead of sent; Inngest dev server|
|Preview (per pull request)|Review and automated end-to-end tests|CI, automatically|Neon database branch seeded with synthetic data; Stripe test mode; SMS mocked; `noindex`; separate Sentry environment|
|Staging|Release rehearsal, load tests, migration rehearsal|CI on merge to `main`|Same topology and same providers as production, smaller compute; Stripe test mode; **real SMS to an allowlist of team numbers only**; synthetic data only|
|Production|Live|Promotion of a staging build by the tech lead|—|

**The differences that matter, stated plainly:** staging uses Stripe test mode,
so a defect that depends on live Stripe behaviour (radar rules, real card
declines, tax) can only appear in production; and no environment other than
production carries real personal data, so no test can prove anything about real
data volume. Both are accepted, and both are the reason for the reconciliation
job in FR-058 and the load test against synthetic data at 10× volume.

---

## 8. Build and development tooling

|Concern|Tool|Note|
|-|-|-|
|Package manager|pnpm 10, version pinned via `packageManager` in `package.json`|Corepack enforces it; a mismatched lockfile fails CI|
|Build tool / bundler|Next.js (Turbopack in development, webpack for production builds)||
|Linter|ESLint 9 flat config, `@typescript-eslint`, `eslint-plugin-security`, plus a custom rule forbidding `db.` calls outside `src/data`|The custom rule is what keeps authorization from being bypassed by a convenient query|
|Formatter|Prettier 3 with the Tailwind class-sorting plugin|Formatting is never a review comment|
|Type checking|`tsc --noEmit` in CI; `strict` plus `noUncheckedIndexedAccess`||
|Test runner|Vitest (unit, integration), Playwright (end-to-end)|See [testing.md](testing.md)|
|Database tooling|`drizzle-kit` for migrations, Testcontainers for integration tests||
|Pre-commit hooks|Husky + lint-staged: format, lint and type-check changed files; `gitleaks` for secrets|Fast checks only — the full suite runs in CI|
|CI / CD|GitHub Actions; deployment by the Vercel GitHub integration|Gates in [testing.md §6](testing.md#6-ci-gates)|
|Dependency updates|Renovate, grouped weekly, automerging patch updates that pass CI||
|Local orchestration|Docker Compose (PostgreSQL, Redis), Inngest dev server, Stripe CLI for webhook forwarding|`pnpm dev` starts all of it|
|Documentation checks|`python tools/check-docs.py --strict`, markdownlint|Runs in CI on every pull request|

A new engineer should reach a running application with a seeded database and a
passing test suite in under 30 minutes; the commands are in
[CONTRIBUTING.md](../CONTRIBUTING.md).

---

## 9. Versions and upgrade policy

**Runtime version policy:** Node.js current LTS. We move to a new LTS within one
quarter of its release and never run a runtime past its end of life. PostgreSQL
major version is upgraded within six months of Neon offering it, in a
maintenance window, rehearsed on a branch first.

**Framework policy:** Next.js and React are upgraded to the current minor
monthly. Major versions wait 30 days after release, then are taken in a
dedicated pull request with the full end-to-end suite as the gate. Next.js
majors have historically required code changes; that work is planned, not
discovered.

**Dependency update cadence:** Renovate opens grouped pull requests every Monday.
Patch and minor updates automerge if CI passes. Majors are reviewed by hand.
Nothing is left more than two majors behind — the cost of catching up grows
faster than the cost of keeping up.

**Security patch SLA:** critical or high severity advisory affecting production
code — patched and deployed within 48 hours. Medium — next weekly batch. Low —
next quarterly review. See
[security.md §5](security.md#5-dependency-and-supply-chain-security).

**Who owns upgrades:** the tech lead, as a standing Monday task. Renovate
without a named owner produces a wall of ignored pull requests.

**If a dependency is abandoned** (no release in 12 months and an open CVE): it
is replaced or vendored, tracked as a decision record. The highest-risk
dependency by this measure is `better-auth`, which is young; the mitigation is
that its data lives in our own schema, so replacing it is a code change and not
a data migration.

---

## 10. Rejected alternatives

|Technology|Considered for|Rejected because|Revisit if|
|-|-|-|-|
|Clerk / Auth0 / Stytch|Authentication|Member identity is the club's most sensitive asset and the privacy promise is the product; a per-MAU price on a free membership tier also scales the wrong way|Support burden of self-hosted account recovery exceeds ~5 cases/week, or we need enterprise SSO|
|Supabase|Database + auth + storage|We self-host auth regardless, which removes most of the bundle; RLS as the primary authorization model is hard to test and easy to bypass with a service-role key|We adopt a client-direct data access pattern, which we currently do not want|
|Firebase|Auth + database|Document model fits neither the relational domain nor the transactional billing requirements; phone auth would put member identity in Google's control|Never, for this product|
|Elasticsearch / Algolia / Typesense|Catalogue search|A separate store to operate, secure, back up and keep in sync, for ≤ 15,000 rows|Catalogue exceeds ~100,000 rows or needs typo tolerance and synonyms across three languages ([decisions/0006](decisions/0006-postgres-full-text-search.md))|
|Paddle / Lemon Squeezy (merchant of record)|Payments|Higher fees and a weaker subscription API; the client accepted the tax obligation to keep Stripe's lifecycle control and test clocks|Sales-tax and VAT registration in more than ~5 jurisdictions becomes a real operational burden|
|Prisma|ORM|Heavier cold start in serverless, and the query engine binary complicates preview environments|Team composition changes toward engineers who know Prisma and not SQL|
|tRPC|Internal API|Server Actions already provide typed server calls within one Next.js codebase|A second first-party client appears (a native app)|
|NestJS / Fastify service|Backend|A second deployment and a second auth surface for one client and three engineers|The team exceeds ~8 engineers or a partner-facing public API is sold|
|Kubernetes (EKS/GKE)|Orchestration|Operating a cluster is a full-time role this project does not have|Compute cost exceeds ~$3,000/month, where the arithmetic starts to favour it|
|BullMQ / pg-boss on our own worker|Background jobs|Requires a long-running process, which the serverless model does not give us for free|We move to containers, at which point pg-boss removes a vendor|
|Sanity / Contentful|Marketing content|Legal and marketing copy changes rarely; MDX in the repository keeps it versioned and reviewed with the code|The client wants to edit marketing copy without a deploy|
|Auto-translation (DeepL/GPT) of partner content|Localisation|Mistranslating a commercial discount term is a liability we would own|Never for commercial terms; possibly for free-text descriptions with a visible "machine translated" label|
