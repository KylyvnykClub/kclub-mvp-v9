# Phase 0 — Foundations

> **Status:** In progress
> **Owner:** _(fill in)_
> **Last updated:** 2026-08-03
> **Write when:** before the first commit of application code.

**Goal, from [requirements.md §6.1](../requirements.md#61-delivery-plan):**
repository, CI, environments, design tokens, i18n scaffolding, schema baseline
and observability wired.

**Exit criterion, verbatim:** _a trivial change reaches staging automatically,
with tests and a rollback._

Nothing in this phase is a feature. Everything in it is a thing that becomes
either impossible or expensive to add later — which is the entire justification
for spending two to three weeks before the first requirement is implemented.

---

## 1. Entry criteria

|Condition|State|
|-|-|
|The documentation set exists and is internally consistent|Met — 14 documents, 10 decision records, `check-docs.py` green|
|The delivery process is agreed|Met — [README.md](README.md)|
|The context contract for AI-assisted work exists|Met — [CLAUDE.md](../../CLAUDE.md)|
|The client is available for decisions during the phase|_(confirm)_ — three questions in T-0.5 need them|

---

## 2. Tasks

|Task|Delivers|FR|Depends on|Est|Status|
|-|-|-|-|-|-|
|T-0.1|Git repository initialised, pushed to GitHub, `.gitignore`, `.nvmrc`, issue labels from [CONTRIBUTING.md](../../CONTRIBUTING.md#reporting-problems)|—|—|0.5d|partial — `main` unprotected, accepted gap (see §3)|
|T-0.2|Twilio Verify API configured in dev mode (codes logged to console, no SMS sent). A2P 10DLC deferred to pre-launch checklist|—|—|0.25d|done — account exists from v4, dev mode active|
|T-0.3|Remaining vendor accounts: Inngest, Sentry, Axiom, Resend, Better Stack. Already provisioned from v4 or earlier: Vercel, Neon (free plan), Upstash, Stripe (test mode), Twilio, Cloudflare|—|—|0.5d|open|
|T-0.4|Document owners assigned in every header, [documentation.md §2](../documentation.md#2-ownership) and `.github/CODEOWNERS`; `check-docs.py --strict` reports zero warnings|—|—|0.5d|open|
|T-0.5|The three blocking client decisions closed and recorded (see §3)|—|—|1d + client|open|
|T-0.6|Next.js 15 skeleton: TypeScript strict, ESLint 9 flat config, Prettier (see §3), Husky, lint-staged, commitlint, `gitleaks`, pnpm pinned via Corepack|—|T-0.1|1d|done 2026-08-03 — see §3 on gitleaks|
|T-0.7|Custom lint rules: no import from `modules/*/internal/**`, no `db.` call outside `src/data`, no React or HTTP import inside `src/domain`|—|T-0.6|0.5d|done 2026-08-04 — `tools/eslint/module-boundaries.mjs`, all three rules proved to fail|
|T-0.8|`src/env.ts` — Zod schema for every environment variable; the application refuses to boot when it is unsatisfied; `.env.example` generated from it|—|T-0.6|0.5d|done 2026-08-04 — schemas in `src/env.schema.ts`, validated eagerly in `src/env.ts`, `.env.example` generated via `pnpm env:example`|
|T-0.9|Drizzle + Neon wiring, `src/data` layer shape, baseline migration, `drizzle-kit` scripts, migration up/down/up check|—|T-0.8|1d|done 2026-08-04 — Drizzle 0.45 + Neon HTTP, baseline migration enables pgcrypto + pg_trgm, up/down/up proved via `pnpm db:updownup`|
|T-0.10|Integration test harness: Testcontainers (PostgreSQL, Redis, MinIO), transactional isolation, typed factories, injected clock and id source|—|T-0.9|1.5d|done 2026-08-04 — Vitest 4 unit+integration configs, Testcontainers PostgreSQL with migration runner, transactional isolation (rollback per test), `Clock`/`IdSource` in `src/domain/context.ts`, factory context in `tests/factories/`, 6 unit tests + 7 integration smoke tests|
|T-0.11|`platform` module skeleton: `Actor`, `assertCan`, rate limiting on Upstash, outbox table and dispatcher, feature flags|—|T-0.10|1.5d|done 2026-08-04 — PR #5|
|T-0.12|`audit` module skeleton, append-only: the application's database role has no `UPDATE` or `DELETE` grant on `audit_log`, proved by a test|—|T-0.10|0.5d|done 2026-08-04 — `audit_log` table with actor/action/subject/meta/ip/ua/correlation_id, `app_rw` role with INSERT only (no UPDATE/DELETE), `appendAuditEntry()` in `src/data`, integration test proves UPDATE and DELETE are rejected|
|T-0.13|**The four constraint suites**, against an empty route table (see §3)|—|T-0.11, T-0.12|2d|done 2026-08-04 — member-leak walker, object-level authz replay, staff role matrix (18 action/subject pairs × 4 roles = 72 assertions), audit completeness. Route registry in `src/domain/route-registry.ts`. All four proved to fail against deliberately broken cases. 133 unit tests.|
|T-0.14|i18n scaffolding: `next-intl`, locale-prefixed routes, `messages/{en,ru,uk}.json`, missing-key check in CI, ICU plural setup for `ru`/`uk`|—|T-0.6|1d|done 2026-08-04 — `next-intl` 4.13 with App Router, `src/i18n/` (routing, request, navigation), middleware for locale-prefixed routes, `src/app/[locale]/` layout with `NextIntlClientProvider` and `lang` attribute, messages in `messages/{en,ru,uk}.json` with ICU plurals (one/few/many/other for ru/uk), `tools/check-i18n-keys.ts` CI gate in `pnpm verify`, 6 unit tests proving plural categories and key completeness|
|T-0.15|Design tokens from [ux.md §6](../ux.md#6-design-system): Tailwind 4 custom properties, light and dark themes, shadcn/ui base installed|—|T-0.6|1d|done 2026-08-04 — Tailwind 4, next-themes, globals.css OKLCH tokens, fonts and 9 shadcn/ui components added|
|T-0.16|CI pipeline with every blocking gate in [testing.md §6](../testing.md#6-ci-gates) wired on the skeleton, first blocking result under 10 minutes|—|T-0.10, T-0.13, T-0.14|1.5d|open|
|T-0.17|Environments: Terraform for Neon, Upstash, Cloudflare and Vercel; preview per pull request with a Neon branch; staging on merge to `main`; seed script|—|T-0.9, T-0.16|1.5d|open|
|T-0.18|Observability wired: Sentry, OpenTelemetry, Axiom, health canary, staging smoke test, and a **rehearsed rollback** ([reliability.md §8](../reliability.md#8-deployment-safety))|—|T-0.17|1d|open|
|T-0.19|Process documents corrected to the real team shape (see §3)|—|T-0.4|0.5d|open|
|T-0.20|FR-090…FR-098 assigned to phases; [requirements.md §6.1](../requirements.md#61-delivery-plan) updated; `check-plan.py --strict` green|—|T-0.5|0.5d|open|
|T-0.21|`phase-1.md` written|—|T-0.5, T-0.20|0.5d|open|

**Total: ~18 focused days.** [requirements.md §6.1](../requirements.md#61-delivery-plan)
budgets two weeks. The difference is T-0.13, which moved here from where it would
otherwise have happened — spread across phases 1, 2 and 5, at several times the
cost and after the routes it constrains already existed. The overrun is a
deliberate purchase, not a slip, and it is the one item in this file worth
defending against pressure to start features sooner.

Vendor accounts carried from v4 (Stripe, Twilio, Upstash, Vercel, Cloudflare)
and the early Neon free-plan provisioning save ~1 day against the original
estimate.

---

## 3. Tasks that need explaining

**T-0.1 — `main` is not protected. Accepted gap.** The repository is private on
the GitHub free plan, where branch rulesets and branch protection are unavailable.
Making it public is not an option: `docs/` contains the security design and
[legal-alignment.md](../legal-alignment.md).

**Controls that compensate:**

- `.husky/pre-push` refuses a push to `main` (committed since T-0.6, shared
  across clones). It stops the accident, not the decision — `--no-verify` passes
  through.
- CI pipeline (T-0.16) runs all gates and reports results. It advises rather than
  blocks; a merge that breaks a gate is visible but not prevented.
- Solo development with AI review (`/code-review`, `/reflect`) substitutes for
  the second reviewer that branch protection would otherwise gate on.

This is revisited if the team grows beyond one or if GitHub offers protection on
free private repositories.

**T-0.2 — Twilio exists; A2P 10DLC deferred.** The Twilio account and Verify
service are carried from v4. During development, SMS codes are logged to the
console (`AUTH_DEV_PHONE_BYPASS_ENABLED=true`), so no real SMS is sent and no
carrier registration is required.

A2P 10DLC registration (1–3 weeks, can be rejected) moves to the **pre-launch
checklist**: it must be approved before the first real US phone number receives an
SMS, but it does not block any development or staging work. The risk entry in §4
is updated accordingly.

**T-0.5 — three decisions that belong to the client.** All three are already
recorded as open; none can be answered by engineering:

|Question|Source|Blocks|
|-|-|-|
|Closed chats versus the no-directory constraint — does the club promise a feature that [ADR 0005](../decisions/0005-no-member-directory.md) forbids?|[legal-alignment.md §4](../legal-alignment.md#4-decision-log)|Phase 1|
|Does the club accept EU members, and who is the Art. 27 representative?|[requirements.md §9](../requirements.md#9-open-questions)|The first EU sign-up, and the phase 7 compliance work|
|Are the nine legal documents converted to versioned MDX before launch? FR-093 records which version a member accepted, which means nothing unless a version is immutable|[requirements.md §9](../requirements.md#9-open-questions)|Phase 1 registration flow|

The first is not a small question. If the answer is "yes, closed chats are
promised", the product's central constraint is in conflict with an executed
document, and that is resolved before identity work starts — not discovered
during it.

**T-0.13 — the four constraint suites, built against nothing.** From
[testing.md §3](../testing.md#3-what-must-be-tested), in the order they should be
written:

1. **Member-leak walker** — enumerates every route and every Server Action,
   invokes each as `guest`, as a member, and as a second member, and asserts no
   response body contains another member's identifier. New routes are picked up
   automatically; a route that leaks fails the build the day it is written.
2. **Object-level authorization replay** — every route replayed with a second
   member's ids: company, subscription, referral, card. Assert 403 or 404, never
   data.
3. **Staff role matrix** — each staff role against each console action, asserted
   against the table in [security.md §2](../security.md#2-authentication-and-authorization).
   An action with no row in the matrix fails the test rather than defaulting to
   allowed.
4. **Audit completeness** — every mutating console action produces exactly one
   audit entry with actor, target and before/after values.

All four pass trivially today, because there is nothing to walk. That is the
point: they are cheap now, they cost days each once there are forty routes, and
they are what makes fast AI-assisted feature work safe rather than merely fast.
Each suite must be proved to fail — write a deliberately leaking route, watch it
go red, delete it. A guard that has never failed is not known to work.

**T-0.6 — two gaps left open, deliberately.**

_`gitleaks` is not installed locally._ It is not in winget, and the pre-commit
hook therefore prints a loud warning and continues rather than blocking. Blocking
every commit on a missing binary is how people learn `--no-verify`, which costs
more than the scan is worth. The real gate is the CI one in T-0.16, where the
GitHub action supplies the binary. Until then, staged changes are not scanned on
this machine.

_Node is 24 locally, 22 in CI and on Vercel._ `.nvmrc` and
[technology.md §9](../technology.md#9-versions-and-upgrade-policy) both say the
current LTS, which is 22. Nothing has broken, and `engines` is set to `>=22` so
neither version is refused — but "works on my machine" is exactly the class of
defect a pinned runtime exists to prevent, and the divergence should close before
anything native enters the dependency tree.

_Tailwind and shadcn/ui are not here._ They are T-0.15, so the placeholder page
is deliberately unstyled. Anything built now would be deleted then.

**T-0.6 — the formatter did not run at all until PR #1.** `prettier.config.mjs` imports
`prettier-plugin-compact-markdown-table` as a default export, which that package
does not provide, so `pnpm format:check` fails on every file with a configuration
error rather than a formatting one. The fix is one line — name the plugin as a
string in `plugins` — but it exposes a decision, because the config asks for
compact tables while every existing document is written with aligned ones, and
markdownlint currently infers the aligned style from them. Decide once: either
reformat the whole set in a single formatting commit and set markdownlint to
match, or drop the plugin. Do not leave a formatter that cannot run — a gate
nobody can execute is worse than no gate, because it is believed to be running.

**T-0.19 — correcting the process documents.** The set was written for three
engineers and a QA. Specifically: [CONTRIBUTING.md](../../CONTRIBUTING.md) requires
two reviewers on `billing`, `identity` and `audit` and a four-hour review
turnaround; [documentation.md §2](../documentation.md#2-ownership) names four
distinct owners; [testing.md §7](../testing.md#7-manual-and-specialist-testing)
assigns exploratory and accessibility testing to QA; `.github/CODEOWNERS` routes
to people who do not exist. Each is rewritten to what will actually happen —
including what replaces the second reviewer — rather than deleted or left to rot.
Where a control genuinely cannot be replaced (a native-speaker localisation review
cannot be done by the author), it is recorded as an accepted gap with the date it
must be resolved by.

**T-0.20 — the unassigned requirements.** FR-090…FR-098 belong to no phase in
§6.1. Several are not small: FR-093 (nine legal documents, versioned, three
languages, acceptance recorded) and FR-097 (separate arbitration and age
acknowledgements at registration) are phase 1 work by dependency, because
registration cannot ship without them. Assigning them at the gate is a scope
decision for the client, and it will probably move work earlier rather than later.

---

## 4. Risks

|Risk|Signal|Response|
|-|-|-|
|A2P 10DLC registration rejected or slow (pre-launch)|No approval two weeks before launch|Escalate to the client. Dev and staging use console-logged codes and are not affected; only production sign-up is blocked|
|A blocking client decision in T-0.5 does not arrive|No answer by the phase gate|Phase 1 does not start. Do not begin identity work against an unresolved directory constraint — that is the most expensive possible rework|
|Constraint suites are written to pass rather than to catch|They have never been seen to fail|Each suite ships with a deliberately broken case, run once, in the same commit|
|CI exceeds the 15-minute budget on an empty project|Pipeline over 10 minutes at T-0.16|Fix now. It only grows, and past twenty minutes changes get batched, which produces exactly the large unreviewable diffs the process avoids|
|Terraform state and console clicks diverge|Any infrastructure change made in a vendor console|Everything except Stripe product objects goes through Terraform from the first day, per [technology.md §6](../technology.md#6-infrastructure-and-hosting)|
|The phase expands into features|A task appears here with an FR number|Move it to phase 1. Phase 0 delivers no requirement|

---

## 5. Exit criteria

The §6.1 criterion, decomposed into checks that can be run:

- [ ] A trivial change on a branch opens a pull request that gets a preview
      deployment with its own Neon database branch
- [ ] Every blocking gate in [testing.md §6](../testing.md#6-ci-gates) runs on
      that pull request, and the first blocking result arrives in under 10 minutes
- [ ] Merging it deploys to staging automatically, and the post-deploy smoke test
      passes
- [ ] The rollback has been **performed**, not documented — a bad build deployed
      to staging on purpose and reverted, with the elapsed time recorded
- [ ] `pnpm verify` is green from a clean clone in under 30 minutes, including
      Docker services, migrations and seed
- [ ] All four constraint suites run in CI, and each has been observed failing
      against a deliberately broken case
- [ ] The application refuses to boot with an incomplete environment, and says
      which variable is missing
- [ ] A string added in English fails CI until it exists in Russian and Ukrainian
- [ ] Both themes render the token set; no hard-coded colour outside the tokens
- [ ] A staff-shaped write is refused by the database against `audit_log`
- [ ] Sentry, traces and logs show a request end to end from staging, correlated
      by one id
- [ ] `check-docs.py --strict` and `check-plan.py --strict` both pass
- [ ] Twilio Verify dev mode works: a console-logged code completes a test
      sign-in on staging
- [ ] The three T-0.5 decisions are recorded, each in a decision record or in the
      document it changes
- [ ] `phase-1.md` exists

---

## 6. Demo script

Run against staging, in this order, in front of whoever is accepting the phase:

1. Clone the repository on a clean machine. Run the four commands in
   [CONTRIBUTING.md](../../CONTRIBUTING.md#getting-set-up). Show `pnpm verify`
   green. State the elapsed time.
2. Change one string. Show CI failing because Russian and Ukrainian are missing.
   Add them. Show it passing.
3. Add a route that returns two members. Show the member-leak walker turning red
   without anyone having written a test for that route. Delete it.
4. Merge. Show the staging deployment, the smoke test, and the trace of a single
   request through Sentry and the logs.
5. Deploy a deliberately broken build. Roll it back. State the elapsed time.
6. Show `check-docs.py --strict` and `check-plan.py --strict`, both green.

If step 3 or step 5 cannot be demonstrated live, the phase is not finished,
regardless of what the task table says.
