# Handoff: Production Environment Readiness

> **Status:** Active handoff
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-12
> **Branch:** `codex/production-env-readiness`
> **Remote:** `origin/codex/production-env-readiness`

This handoff captures the production-readiness work completed after the
role-contract repair and names the next useful steps. Treat the current branch
as the working branch for launch hardening unless the user asks for a fresh
branch.

## Current Git State

Latest pushed commits on `codex/production-env-readiness`:

```text
3133e22 fix: localize dashboard navigation labels
954c5ab fix: force production env check invariants
340c114 fix: narrow public card verification data
f9d8f28 test: enforce route registry coverage
d2500a2 chore: add production env check
4b31d8e docs: add production launch evidence ledger
d094ea0 docs: add launch runbook pack
82213bb chore: add deployment smoke check
dbff075 docs: add production environment readiness gate
4283b9e fix: align persisted roles with actor contract
```

The working tree was clean after the last push.

## Completed In This Thread

- Fixed the P0 role-contract drift between persisted roles, session data, and
  the domain actor model in `4283b9e`.
- Added the production environment readiness checklist:
  [production-env-readiness.md](production-env-readiness.md).
- Added the production launch evidence ledger:
  [production-launch-evidence.md](production-launch-evidence.md).
- Added deployment smoke tooling:
  `pnpm smoke:deployment https://preview-or-production-url`.
- Added production env validation:
  `pnpm env:check:production`.
- Hardened the env CLI so it always evaluates launch invariants as production,
  even when a local env file omits `VERCEL_ENV`.
- Added runbooks for every paging alert linked from
  [observability.md](../observability.md).
- Added route registry coverage regression so App Router routes cannot drift
  away from `src/domain/route-registry.ts`.
- Narrowed public card verification data to FR-023 fields only.
- Localized dashboard mobile navigation labels and added a regression against
  hardcoded English labels.

## Validation Evidence

The following passed locally after the production-readiness changes:

```powershell
pnpm verify
pnpm build
pnpm test:integration
python tools/check-docs.py --strict
git diff --check
```

Targeted checks also passed:

```powershell
pnpm test tests/constraints/production-env-check.test.ts
pnpm test tests/constraints/route-registry-coverage.test.ts
pnpm test tests/constraints/dashboard-i18n.test.ts
pnpm test:integration tests/identity-card-tokens.integration.test.ts
```

Known expected local red check:

```powershell
pnpm exec tsx --env-file=.env.local tools/check-production-env.ts
```

That command correctly fails against the current local `.env.local` because the
loaded values are not production-ready:

- `CRON_SECRET` is missing for production mode.
- `AUTH_DEV_PHONE_BYPASS_ENABLED` is enabled.
- Stripe keys are present, but the local values use test prefixes.

Do not treat that as a code failure. It is evidence that the launch env gate is
now strict enough.

## Production Ledger State

Current launch evidence summary:

- `AC-05` is `ready_for_rehearsal`: route registry coverage now checks real
  App Router route paths.
- `AC-09` is `ready_for_rehearsal`: restore runbook exists; rehearsal evidence
  is still external.
- `AC-10` is `ready_for_rehearsal`: every paging alert links to a runbook;
  rehearsal evidence is still external.
- `AC-04`, `AC-07`, and `AC-11` remain `in_progress`.
- `AC-01`, `AC-02`, `AC-03`, `AC-06`, `AC-08`, and `AC-12` remain blocked by
  missing product work, external evidence, vendor approval, or operational
  rehearsal.

## Recommended Next Steps

1. Start with `git status -sb` and confirm the branch is still
   `codex/production-env-readiness`.
2. Re-run the fast baseline:

   ```powershell
   pnpm verify
   python tools/check-docs.py --strict
   git diff --check
   ```

3. Pick one production blocker, not a broad sweep:

   - **Billing lifecycle (`AC-03`)**: inspect `docs/delivery/phase-3.md`,
     `src/actions/stripe.ts`, `src/app/api/webhooks/stripe/route.ts`, and
     `tests/billing-*.integration.test.ts`. Focus on lifecycle coverage and
     test-clock evidence requirements before changing code.
   - **Legal evidence (`AC-11`)**: inspect `content/legal/`,
     `src/lib/legal-consents.ts`, and registration actions/pages. Verify exact
     document versions are recorded and localizable.
   - **Hardcoded visible strings (`AC-07`)**: continue targeted i18n cleanup.
     Avoid broad regex-only rewrites; inspect components and add focused
     regressions.
   - **Production env cleanup**: if the user provides production values or says
     they changed Vercel, run `pnpm env:check:production` in the production env
     context and record the result in
     [production-env-readiness.md](production-env-readiness.md).

## Guardrails For The Next Session

- Do not expose secret values from `.env.local`; report presence and failures by
  key only.
- Do not mark launch criteria `complete` without linked evidence from CI,
  preview, production, vendor dashboard, or a rehearsal artifact.
- Do not revert unrelated dirty files if a future session starts with a dirty
  tree.
- Keep changes narrow and commit/push small production-readiness slices.
- After committing, include the Codex git directives in the final response.
